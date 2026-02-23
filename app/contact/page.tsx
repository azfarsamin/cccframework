"use client";

import { useState } from "react";

export default function ContactPage() {
  const [status, setStatus] = useState<string>("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("Sending...");

    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      message: String(fd.get("message") ?? ""),
    };

    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setStatus("Message sent successfully.");
      e.currentTarget.reset();
    } else {
      setStatus("Something went wrong. Try again.");
    }
  }

  return (
    <>
      <div className="kicker">Consulting • collaboration</div>
      <h1>Contact</h1>

      <div className="card">
        <form onSubmit={handleSubmit}>
          <label className="label">
            Name
            <input className="input" name="name" required />
          </label>

          <label className="label">
            Email
            <input className="input" type="email" name="email" required />
          </label>

          <label className="label">
            Message
            <textarea className="textarea" name="message" rows={7} required />
          </label>

          <button className="button primary" type="submit">
            Send
          </button>

          {status && (
            <p className="muted" style={{ marginTop: 12 }}>
              {status}
            </p>
          )}
        </form>
      </div>
    </>
  );
}
