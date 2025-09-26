import { Router } from "express";
import userRoutes from "./userRoutes.js";  // Correct import

const router = Router();

router.use("/users", userRoutes);

export default router;
