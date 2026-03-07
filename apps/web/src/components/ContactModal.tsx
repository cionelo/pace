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
  const [state, setState] = useState<SubmitState>("idle");

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    try {
      const body: Record<string, string> = { type, description };
      if (url) body.url = url;
      if (email) body.email = email;

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
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
      onClick={handleClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-zinc-100">
            {state === "success" ? "Sent!" : "Contact"}
          </h2>
          <button
            onClick={handleClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {state === "success" ? (
          <div className="space-y-4">
            <p className="text-sm text-zinc-300">
              Thanks! We'll review your submission.
            </p>
            <button
              onClick={handleClose}
              className="bg-zinc-700 hover:bg-zinc-600 text-white text-sm px-4 py-2 rounded transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as FormType)}
                className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded px-3 py-2 text-sm w-full"
              >
                <option>Bug Report</option>
                <option>Race Request</option>
                <option>Feature Request</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                {DESCRIPTION_LABEL[type]}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={4}
                className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded px-3 py-2 text-sm w-full resize-none"
              />
            </div>

            {type === "Race Request" && (
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Race Results URL
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..."
                  className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded px-3 py-2 text-sm w-full"
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Email (optional, for follow-up)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded px-3 py-2 text-sm w-full"
              />
            </div>

            {state === "error" && (
              <p className="text-xs text-red-400">
                Something went wrong. Please try again.
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={state === "submitting"}
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded disabled:opacity-40 transition-colors"
              >
                {state === "submitting" ? "Sending…" : "Send"}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="bg-zinc-700 hover:bg-zinc-600 text-white text-sm px-4 py-2 rounded transition-colors"
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
