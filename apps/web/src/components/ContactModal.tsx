import { useState } from "react";

interface ContactModalProps {
  open: boolean;
  onClose: () => void;
}

type FormType = "Bug Report" | "Race Request" | "Feature Request";
type SubmitState = "idle" | "submitting" | "success" | "error";

const DESCRIPTION_LABEL: Record<FormType, string> = {
  "Bug Report": "What went wrong? Include athlete/race name if applicable.",
  "Race Request": "Which race should be added? Any context about conference/season?",
  "Feature Request": "Describe the feature.",
};

export default function ContactModal({ open, onClose }: ContactModalProps) {
  const [type, setType] = useState<FormType>("Bug Report");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [social, setSocial] = useState("");
  const [state, setState] = useState<SubmitState>("idle");

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    try {
      const body: Record<string, string> = { type, description, email };
      if (url) body.url = url;
      if (social) body.social = social;

      const res = await fetch(
        `https://formspree.io/f/${import.meta.env.VITE_FORMSPREE_ID}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
        }
      );
      setState(res.ok ? "success" : "error");
    } catch {
      setState("error");
    }
  }

  function handleClose() {
    setState("idle");
    setType("Bug Report");
    setDescription("");
    setUrl("");
    setEmail("");
    setSocial("");
    onClose();
  }

  const inputClass = "bg-pace-input border border-pace-border text-pace-text rounded-xl px-4 py-2.5 text-sm w-full focus:border-pace-accent focus:outline-none focus:ring-2 focus:ring-pace-accent/10 transition-all duration-300";

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={handleClose}
    >
      <div
        className="bg-pace-card border border-pace-border rounded-2xl p-6 w-full max-w-md mx-4 shadow-pace-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg text-pace-text">
            {state === "success" ? "Sent!" : "Contact"}
          </h2>
          <button
            onClick={handleClose}
            className="text-pace-text-muted hover:text-pace-text transition-colors duration-300 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {state === "success" ? (
          <div className="space-y-4">
            <p className="text-sm text-pace-text-secondary">
              Thanks! We'll review your submission.
            </p>
            <button
              onClick={handleClose}
              className="bg-pace-card-inner hover:bg-pace-border text-pace-text text-sm font-medium px-5 py-2.5 rounded-full transition-colors duration-300"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-pace-text-secondary mb-1.5">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as FormType)} className={inputClass}>
                <option>Bug Report</option>
                <option>Race Request</option>
                <option>Feature Request</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-pace-text-secondary mb-1.5">
                {DESCRIPTION_LABEL[type]}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={4}
                className={`${inputClass} resize-none`}
              />
            </div>

            {type === "Race Request" && (
              <div>
                <label className="block text-xs font-medium text-pace-text-secondary mb-1.5">
                  Race Results URL
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..."
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-pace-text-secondary mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-pace-text-secondary mb-1.5">
                Social (optional)
              </label>
              <input
                type="text"
                value={social}
                onChange={(e) => setSocial(e.target.value)}
                placeholder="@handle or profile URL"
                className={inputClass}
              />
            </div>

            {state === "error" && (
              <p className="text-xs text-red-500">
                Something went wrong. Please try again.
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={state === "submitting"}
                className="bg-pace-accent hover:bg-pace-accent-hover text-white text-sm font-medium px-5 py-2.5 rounded-full disabled:opacity-40 transition-all duration-300"
              >
                {state === "submitting" ? "Sending\u2026" : "Send"}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="bg-pace-card-inner hover:bg-pace-border text-pace-text text-sm font-medium px-5 py-2.5 rounded-full transition-colors duration-300"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
