import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import { updateUserPreferencesSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { userPreferenceService } from "../services/user-preferences.js";
import { assertBoard } from "./authz.js";

function requireBoardUserId(req: Request, res: Response): string | null {
  assertBoard(req);
  if (!req.actor.userId) {
    res.status(403).json({ error: "Board user context required" });
    return null;
  }
  return req.actor.userId;
}

/**
 * The signed-in person's own display preferences. Reads and writes are keyed
 * by the session user only — there is no way to address another user — and
 * the values are presentation-only, so no company activity is logged.
 */
export function userPreferenceRoutes(db: Db) {
  const router = Router();
  const svc = userPreferenceService(db);

  router.get("/user-preferences/me", async (req, res) => {
    const userId = requireBoardUserId(req, res);
    if (!userId) return;
    res.json(await svc.get(userId));
  });

  router.patch("/user-preferences/me", validate(updateUserPreferencesSchema), async (req, res) => {
    const userId = requireBoardUserId(req, res);
    if (!userId) return;
    res.json(await svc.update(userId, req.body));
  });

  return router;
}
