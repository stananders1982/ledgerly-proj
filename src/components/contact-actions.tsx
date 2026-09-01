import { PhoneCall, Mail, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { telLink, waLink, mailtoLink } from "@/lib/outreach";

export function ContactActions({
  phone,
  email,
  name,
  size = "sm",
}: {
  phone?: string | null;
  email?: string | null;
  name?: string | null;
  size?: "sm" | "icon";
}) {
  const tel = telLink(phone);
  const wa = waLink(phone);
  const mail = mailtoLink(email, name || undefined);

  if (size === "icon") {
    return (
      <div className="flex items-center gap-1">
        {tel ? (
          <Button asChild size="icon" variant="outline" className="h-8 w-8" title={`Call ${phone}`}>
            <a href={tel}><PhoneCall className="h-4 w-4" /></a>
          </Button>
        ) : (
          <Button size="icon" variant="outline" className="h-8 w-8 opacity-60" disabled title="No phone number">
            <PhoneCall className="h-4 w-4" />
          </Button>
        )}
        {wa ? (
          <Button asChild size="icon" variant="outline" className="h-8 w-8" title={`WhatsApp ${phone}`}>
            <a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" /></a>
          </Button>
        ) : (
          <Button size="icon" variant="outline" className="h-8 w-8 opacity-60" disabled title="No phone number">
            <MessageCircle className="h-4 w-4" />
          </Button>
        )}
        {mail ? (
          <Button asChild size="icon" variant="outline" className="h-8 w-8" title={`Email ${email}`}>
            <a href={mail}><Mail className="h-4 w-4" /></a>
          </Button>
        ) : (
          <Button size="icon" variant="outline" className="h-8 w-8 opacity-60" disabled title="No email address">
            <Mail className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tel ? (
        <Button asChild size="sm" variant="outline" title={`Call ${phone}`}>
          <a href={tel}><PhoneCall className="mr-1.5 h-4 w-4" /> Call</a>
        </Button>
      ) : (
        <Button size="sm" variant="outline" disabled title="No phone number"><PhoneCall className="mr-1.5 h-4 w-4" /> Call</Button>
      )}
      {wa ? (
        <Button asChild size="sm" variant="outline" title={`WhatsApp ${phone}`}>
          <a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp</a>
        </Button>
      ) : (
        <Button size="sm" variant="outline" disabled title="No phone number"><MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp</Button>
      )}
      {mail ? (
        <Button asChild size="sm" variant="outline" title={`Email ${email}`}>
          <a href={mail}><Mail className="mr-1.5 h-4 w-4" /> Email</a>
        </Button>
      ) : (
        <Button size="sm" variant="outline" disabled title="No email address"><Mail className="mr-1.5 h-4 w-4" /> Email</Button>
      )}
    </div>
  );
}
