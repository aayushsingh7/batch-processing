import { Queue } from "bullmq";
import redis from "../config/redis.js";

const likeQueue = new Queue("like-processing", { connection: redis });

await likeQueue.upsertJobScheduler(
  "stale-like-sync",
 { every: 300000, },
 { name: "sync-stale-likes", }
);

export default likeQueue;
