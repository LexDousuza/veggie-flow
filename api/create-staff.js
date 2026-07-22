// /api/create-staff.js
// Securely creates a new staff/admin account using the Supabase service role key.
// This MUST run server-side — the service role key has full database access
// and must never be exposed to the browser.
//
// Why this exists: using supabase.auth.signUp() from the browser while already
// logged in as admin replaces the admin's session with the new user's session
// (a well-known Supabase client behavior). This endpoint avoids that entirely
// by using the admin API, which doesn't touch the caller's session at all.

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://xkhkoinipuqqeeljohdq.supabase.co";

module.exports.config = {
  api: { bodyParser: true },
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { adminAccessToken, name, email, password, role } = req.body;

    if (!adminAccessToken || !name || !email || !password || !role) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }
    if (!["admin", "staff"].includes(role)) {
      res.status(400).json({ error: "Invalid role" });
      return;
    }

    // Service role client — bypasses RLS, used only for trusted server-side admin actions
    const adminClient = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Verify the caller is actually a logged-in admin before doing anything privileged
    const { data: callerData, error: callerErr } = await adminClient.auth.getUser(adminAccessToken);
    if (callerErr || !callerData?.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", callerData.user.id)
      .single();
    if (callerProfile?.role !== "admin") {
      res.status(403).json({ error: "Only admins can create accounts" });
      return;
    }

    // Create the new user using the admin API — does not affect the caller's session
    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) {
      console.error("create-staff: createUser failed:", createErr.message);
      res.status(400).json({ error: "Could not create account. Double-check the details and try again." });
      return;
    }

    await adminClient.from("profiles").upsert([{ id: newUser.user.id, name, role, email }]);

    res.status(200).json({ success: true, email });
  } catch (err) {
    console.error("create-staff error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
};
