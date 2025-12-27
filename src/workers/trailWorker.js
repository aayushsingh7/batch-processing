import { Worker } from "bullmq";
import redis from "../config/redis.js";
import { Like, Post } from "../database/associations.js";
import myQueue from "../queues/trailQueue.js";
import { Op } from "sequelize";
import sequelize from "../config/mysql.js";

const worker = new Worker(
  "foo",
  async (job) => {
    if (job.name == "bulk-likes") {
      const { post_id } = job.data;
      const likeKey = `posts:${post_id}:likes`;
      const dislikeKey = `posts:${post_id}:dislikes`;
      const pLikeKey = `processing:posts:${post_id}:likes`;
      const pDislikeKey = `processing:posts:${post_id}:dislikes`;
      const t = await sequelize.transaction();

      try {
        const [hasLikes, hasDislikes] = await Promise.all([
          redis.exists(likeKey),
          redis.exists(dislikeKey),
        ]);

        if (hasLikes) await redis.rename(likeKey, pLikeKey);
        if (hasDislikes) await redis.rename(dislikeKey, pDislikeKey);

        const likedBy = hasLikes ? await redis.smembers(pLikeKey) : [];
        const dislikedBy = hasDislikes ? await redis.smembers(pDislikeKey) : [];

        const conflictIds = likedBy.filter((id) => dislikedBy.includes(id));
        const finalLikes = likedBy.filter((id) => !conflictIds.includes(id));
        const finalDislikes = dislikedBy.filter( (id) => !conflictIds.includes(id) );

        if (finalDislikes.length > 0) {
          await Like.destroy({
            where: { post_id, user_id: { [Op.in]: finalDislikes } },
            transaction: t,
          });
        }

        if (finalLikes.length > 0) {
          await Like.bulkCreate(
            finalLikes.map((u_id) => ({ post_id, user_id: u_id })),
            { ignoreDuplicates: true, transaction: t }
          );
        }

        const netChange = finalLikes.length - finalDislikes.length;
        await Post.increment(
          { like_count: netChange },
          { where: { id: post_id }, transaction: t }
        );
        await Promise.all([redis.del(pLikeKey), redis.del(pDislikeKey)]);
        await t.commit();
      } catch (error) {
        await t.rollback();

        const [pLikeExists, pDislikeExists] = await Promise.all([
          redis.exists(pLikeKey),
          redis.exists(pDislikeKey),
        ]);

        if (pLikeExists) {
          await redis.sunionstore(likeKey, likeKey, pLikeKey);
          await redis.del(pLikeKey);
        }

        if (pDislikeExists) {
          await redis.sunionstore(dislikeKey, dislikeKey, pDislikeKey);
          await redis.del(pDislikeKey);
        }
        console.error( `Job ${job.id} failed. Data restored to Redis for retry.` );
        throw error;
      }
    }
    if (job.name == "sync-stale-likes") {
      const postIds = await redis.smembers("post_with_pending_likes");
      if (postIds.length == 0) return;
      const jobs = postIds.map((id) => ({
        name: "bulk-likes",
        data: { post_id: id },
       opts: { jobId: `bulk:${id}`, attempts: 3, backoff: { type: "exponential", delay: 5000 }, },
      }));

      await myQueue.addBulk(jobs);
      await redis.del("post_with_pending_likes");
    }
  },
  { connection: redis }
);

worker.on("completed", (job) => {
  console.log(`${job.id} has completed!`);
});

worker.on("failed", (job, err) => {
  console.log(`${job.id} has failed with ${err.message}`);
});
