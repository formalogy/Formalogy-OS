import { createHmac, timingSafeEqual } from "node:crypto";

import { prisma } from "@/lib/prisma";

/// Notifications de Resend : email délivré, ouvert, rejeté.
///
/// Route publique par nature — Resend doit pouvoir l'appeler — et donc protégée
/// autrement que par une session : chaque notification porte une signature
/// calculée avec un secret partagé (format Svix). Une notification non signée,
/// mal signée ou trop ancienne est refusée.

const TOLERANCE_SECONDES = 5 * 60;

function signatureValide(secret: string, id: string, horodatage: string, corps: string, entete: string): boolean {
  const cle = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const attendue = createHmac("sha256", cle).update(`${id}.${horodatage}.${corps}`).digest();
  // L'en-tête peut contenir plusieurs signatures (rotation de clé), « v1,xxx v1,yyy ».
  return entete.split(" ").some((partie) => {
    const [version, valeur] = partie.split(",");
    if (version !== "v1" || !valeur) return false;
    const recue = Buffer.from(valeur, "base64");
    return recue.length === attendue.length && timingSafeEqual(recue, attendue);
  });
}

type Notification = {
  type: string;
  created_at?: string;
  data?: { email_id?: string };
};

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return new Response("Notifications non configurées.", { status: 503 });

  const id = request.headers.get("svix-id");
  const horodatage = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !horodatage || !signature) return new Response("Signature absente.", { status: 400 });

  // Une notification ancienne rejouée par un tiers est refusée.
  const ecart = Math.abs(Date.now() / 1000 - Number(horodatage));
  if (!Number.isFinite(ecart) || ecart > TOLERANCE_SECONDES) {
    return new Response("Notification expirée.", { status: 400 });
  }

  const corps = await request.text();
  if (!signatureValide(secret, id, horodatage, corps, signature)) {
    return new Response("Signature invalide.", { status: 401 });
  }

  let notification: Notification;
  try {
    notification = JSON.parse(corps);
  } catch {
    return new Response("Contenu illisible.", { status: 400 });
  }

  const fournisseurId = notification.data?.email_id;
  if (!fournisseurId) return new Response("OK");

  const moment = notification.created_at ? new Date(notification.created_at) : new Date();
  const email = await prisma.email.findUnique({ where: { fournisseurId } });
  // Email inconnu (envoyé hors de l'application) : on accuse réception sans
  // rien faire, sinon Resend réessaierait indéfiniment.
  if (!email) return new Response("OK");

  switch (notification.type) {
    case "email.delivered":
      await prisma.email.update({
        where: { id: email.id },
        // Un email déjà marqué « ouvert » ne redescend pas à « délivré » si les
        // notifications arrivent dans le désordre.
        data: { delivreAt: moment, ...(email.statut === "OUVERT" ? {} : { statut: "DELIVRE" }) },
      });
      break;
    case "email.opened":
      await prisma.email.update({
        where: { id: email.id },
        data: { statut: "OUVERT", ouvertAt: email.ouvertAt ?? moment },
      });
      break;
    case "email.bounced":
    case "email.complained":
      await prisma.email.update({
        where: { id: email.id },
        data: {
          statut: "ECHEC",
          erreur: notification.type === "email.bounced" ? "Adresse rejetée par le serveur du destinataire." : "Signalé comme indésirable par le destinataire.",
        },
      });
      break;
  }

  return new Response("OK");
}
