import type { NextApiRequest, NextApiResponse } from "next";
import { initializeDatabase, checkConnection } from "../../config/db.config";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  initializeDatabase();
  const status = await checkConnection();
  if (status.connected) {
    return res.status(200).json({ connected: true, message: status.message });
  } else {
    return res.status(500).json({ connected: false, message: status.message });
  }
}
