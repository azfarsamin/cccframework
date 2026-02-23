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
      <form onSubmit={handleSubmit} className="form">
  <div className="formGrid">
    <div className="field">
      <label className="label" htmlFor="name">Name</label>
      <input className="input" id="name" name="name" autoComplete="name" required />
    </div>

    <div className="field">
      <label className="label" htmlFor="email">Email</label>
      <input
        className="input"
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
      />
    </div>

    <div className="field fieldFull">
      <label className="label" htmlFor="message">Message</label>
      <textarea
        className="textarea"
        id="message"
        name="message"
        rows={8}
        required
      />
    </div>

    <div className="actions fieldFull">
      <button className="button primary" type="submit">
        Send
      </button>
      {status && <div className="muted status">{status}</div>}
    </div>
  </div>
</form>
      </div>
    </>
  );
}
