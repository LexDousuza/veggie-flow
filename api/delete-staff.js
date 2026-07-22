// /api/delete-staff.js
// Securely deletes a staff/admin account using the Supabase service role key.
// Same pattern as create-staff.js: runs server-side only, verifies the caller
// is a logged-in admin before doing anything privileged, and never exposes
// the service role key to the browser.

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
    const { adminAccessToken, userId } = req.body;

    if (!adminAccessToken || !userId) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const adminClient = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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
      res.status(403).json({ error: "Only admins can delete accounts" });
      return;
    }
    if (callerData.user.id === userId) {
      res.status(400).json({ error: "You can't delete your own account while logged in" });
      return;
    }

    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteErr) {
      res.status(400).json({ error: deleteErr.message });
      return;
    }
    await adminClient.from("profiles").delete().eq("id", userId);

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("delete-staff error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
};
