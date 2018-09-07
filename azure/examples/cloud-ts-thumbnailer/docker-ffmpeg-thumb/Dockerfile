FROM jrottenberg/ffmpeg

RUN apt-get update && \
    apt-get install python-dev python-pip -y && \
    apt-get clean

RUN pip install azure-cli

WORKDIR /tmp/workdir

ENTRYPOINT \
  echo "Starting ffmpeg task..." && \
  echo "Downloading video from azure ${CONTAINER}/${INPUT_VIDEO} to ./${INPUT_VIDEO}..." && \
  az storage blob download --container-name ${CONTAINER} --name ${INPUT_VIDEO} --file ./${INPUT_VIDEO} --output table && \
  echo "Download succeeded. Extracting thumnail at ${TIME_OFFSET} and writing to ${OUTPUT_FILE}." && \
  ffmpeg -i ./${INPUT_VIDEO} -ss ${TIME_OFFSET} -vframes 1 -f image2 -an -y ./${OUTPUT_FILE} && \
  echo "Thumbnail extraction succeeded.  Uploading to ${CONTAINER}/${OUTPUT_FILE}." && \
  az storage blob upload --container-name ${CONTAINER} --file ./${OUTPUT_FILE} --name ${OUTPUT_FILE} && \
  echo "Upload succeeded.  Terminating."

