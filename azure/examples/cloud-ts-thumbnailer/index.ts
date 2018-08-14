// Copyright 2016-2018, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud-azure";

// A bucket to store videos and thumbnails.
const bucket = new cloud.Bucket("bucket");

// A task which runs a containerized FFMPEG job to extract a thumbnail image.
const ffmpegThumbnailTask = new cloud.Task("ffmpegThumbTask", {
    build: "./docker-ffmpeg-thumb",
});

// When a new video is uploaded, run the FFMPEG task on the video file.
// Use the time index specified in the filename (e.g. cat_00-01.mp4 uses timestamp 00:01)
bucket.onPut("onNewVideo", bucketArgs => {
    console.log(`*** New video: file ${bucketArgs.key} was uploaded at ${bucketArgs.eventTime}.`);
    const file = bucketArgs.key;

    const thumbnailFile = file.substring(0, file.indexOf("_")) + ".jpg";
    const framePos = file.substring(file.indexOf("_") + 1, file.indexOf(".")).replace("-", ":");

    const env = {
        "BUCKET": bucket.container.id.get(),
        "INPUT_VIDEO": file,
        "TIME_OFFSET": framePos,
        "OUTPUT_FILE": thumbnailFile,
    };

    console.log("Running task with env: " + JSON.stringify(env, null, 2));

    ffmpegThumbnailTask.run({
        environment: env,
    }).then(() => {
        console.log(`Running thumbnailer task.`);
    });
}, { keySuffix: ".mp4" });

// When a new thumbnail is created, log a message.
bucket.onPut("onNewThumbnail", bucketArgs => {
    console.log(`*** New thumbnail: file ${bucketArgs.key} was saved at ${bucketArgs.eventTime}.`);
    return Promise.resolve();
}, { keySuffix: ".jpg" });

// Export the bucket name.
export const bucketName = bucket.container.id;
