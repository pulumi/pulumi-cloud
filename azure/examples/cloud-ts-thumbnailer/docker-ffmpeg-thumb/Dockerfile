FROM jrottenberg/ffmpeg

RUN apt-get update && \
    apt-get install python-dev python-pip -y && \
    apt-get clean

RUN pip install azure-cli

WORKDIR /tmp/workdir

ENTRYPOINT \
  echo "Starting ffmpeg task..." && \
  echo "Copying video from azure ${BUCKET}/${INPUT_VIDEO} to ${INPUT_VIDEO}..."

