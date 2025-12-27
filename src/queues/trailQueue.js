import { Queue } from "bullmq";
import redis from "../config/redis.js";

const myQueue = new Queue("foo", { connection: redis });

await myQueue.upsertJobScheduler(
  "foo",
 { every: 300000, },
 { name: "sync-stale-likes", }
);

export default myQueue;
