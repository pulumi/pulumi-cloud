FROM jrottenberg/ffmpeg

RUN apt-get update && \
    apt-get install ca-certificates curl apt-transport-https lsb-release gnupg -y && \
    curl -sL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor | tee /etc/apt/trusted.gpg.d/microsoft.asc.gpg > /dev/null && \
    echo "deb [arch=amd64] https://packages.microsoft.com/repos/azure-cli/ $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/azure-cli.list && \
    apt-get update && \
    apt-get install azure-cli -y && \
    apt-get clean

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

