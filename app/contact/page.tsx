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
