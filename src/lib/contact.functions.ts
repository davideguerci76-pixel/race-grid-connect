import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CONTACT_REASONS = [
  "general_info",
  "technical_issue",
  "account_profile",
  "pitcall_matching",
  "feedback_suggestion",
  "report_problem",
  "partnership_business",
  "other",
] as const;

const contactSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(100, "Name is too long"),
  email: z.string().trim().toLowerCase().email("Invalid email address").max(255, "Email is too long"),
  userType: z.enum(["team", "freelancer"]),
  reasons: z.array(z.enum(CONTACT_REASONS)).min(1, "Select at least one reason"),
  subject: z.string().trim().min(2, "Subject is too short").max(200, "Subject is too long"),
  message: z.string().trim().min(10, "Message is too short").max(2000, "Message is too long"),
});

export type ContactFormInput = z.infer<typeof contactSchema>;

/**
 * Sends a contact form message to info@pitcall.net.
 * Public, unauthenticated endpoint with strict input validation.
 */
export const sendContactMessage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => contactSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");

    const reasonsLabel = data.reasons
      .map((r) =>
        r
          .split("_")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ")
          .replace("Pitcall", "PITCALL")
          .replace("Account Profile", "Account / Profile")
          .replace("Feedback Suggestion", "Feedback / Suggestion")
          .replace("Report Problem", "Report a problem")
          .replace("Partnership Business", "Partnership / Business"),
      )
      .join(", ");

    await sendTemplateEmail("contactForm", "info@pitcall.net", {
      replyTo: data.email,
      templateData: {
        name: data.name,
        email: data.email,
        userType: data.userType === "team" ? "Team" : "Freelancer",
        reasons: reasonsLabel,
        subject: data.subject,
        message: data.message,
      },
    });

    return { ok: true };
  });
