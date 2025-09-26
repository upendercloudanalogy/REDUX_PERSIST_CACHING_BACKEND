import { Router } from "express";
import prisma from "../prisma-client.js";
import redisClient from "../redis-client.js";
import crypto from "crypto";

const router = Router();
const CACHE_EXPIRY = 300; // 5 minutes

// ---------- Helper functions ----------
async function setCacheWithETag(key, value) {
    console.log('set cache with etag',key,value);
    
  const etag = crypto.createHash("md5").update(JSON.stringify(value)).digest("hex");
  console.log(etag,'etag');
  
  await redisClient.set(key, JSON.stringify({ data: value, etag }), { EX: CACHE_EXPIRY });
  const x = await redisClient.get(key);
  console.log(
  JSON.parse(x),
  'final setCacheWithetag'
);

  return etag;
}

async function getCacheWithETag(key) {
    console.log('inside getcached with etag ', key);
    
  const cached = await redisClient.get(key);
  if (!cached) return null;
  return JSON.parse(cached); // { data, etag }
}

async function delCache(keys) {
  if (!Array.isArray(keys)) keys = [keys];
  if (keys.length > 0) await redisClient.del(...keys);
}

// ---------- CREATE ----------
router.post("/", async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ message: "Name and email are required" });

  try {
    const newTest = await prisma.test.create({ data: { name, email } });

    // Invalidate caches
    await delCache("tests");

    res.status(201).json(newTest);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ message: "Email already exists" });
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ---------- READ ALL ----------
router.get("/", async (req, res) => {
  try {
    let cached = await getCacheWithETag("tests");

    if (!cached) {
      const data = await prisma.test.findMany();
      const etag = await setCacheWithETag("tests", data);
      cached = { data, etag };
    }

    if (req.headers["if-none-match"] === cached.etag) return res.status(304).end();

    res.setHeader("ETag", cached.etag);
    res.setHeader("Cache-Control", `public, max-age=${CACHE_EXPIRY}`);
    res.json(cached.data);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ---------- READ ONE ----------
router.get("/:email", async (req, res) => {
  const { email } = req.params;
  if (!email) return res.status(400).json({ message: "Email is required" });

  console.log(email,'email');
  try {
    // 1. Try Redis cache
    let cached = await getCacheWithETag(`test:${email}`);

    // 2. If not cached → fetch from DB
    if (!cached) {
      const data = await prisma.test.findUnique({ where: { email } });
      if (!data) return res.status(404).json({ message: "Test not found" });

      const etag = await setCacheWithETag(`test:${email}`, data);
      cached = { data, etag };
    }

    // 3. Handle ETag from client
    if (req.headers["if-none-match"] === cached.etag) {
      console.log(cached.etag === req.headers["if-none-match"]);
      
      return res.status(304).end(); // Not Modified
    }

    // 4. Send response with ETag + Cache-Control
    res.setHeader("ETag", cached.etag);
    res.setHeader("Cache-Control", `public, max-age=${CACHE_EXPIRY}`);
    res.json(cached.data);

  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ---------- UPDATE ----------
router.put("/:email", async (req, res) => {
  const { email } = req.params;
  const { name } = req.body;

  if (!email) return res.status(400).json({ message: "Email is required" });
  if (!name) return res.status(400).json({ message: "Name is required" });

  try {
    const updatedTest = await prisma.test.update({
      where: { email },
      data: { name },
    });

    // Update caches
    await Promise.all([
      setCacheWithETag(`test:${email}`, updatedTest),
      delCache("tests"),
    ]);

    // Set ETag and Cache-Control
    const etag = crypto.createHash("md5").update(JSON.stringify(updatedTest)).digest("hex");
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", `public, max-age=${CACHE_EXPIRY}`);

    res.json(updatedTest);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ message: "Test not found" });
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ---------- DELETE ----------
router.delete("/:email", async (req, res) => {
  const { email } = req.params;
  if (!email) return res.status(400).json({ message: "Email is required" });

  try {
    await prisma.test.delete({ where: { email } });

    // Delete caches
    await delCache([`test:${email}`, "tests"]);

    res.json({ message: "Deleted successfully" });
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ message: "Test not found" });
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

export default router;
