#!/bin/sh

if ! systemctl is-active --quiet docker; then
    echo "Docker was sleep 💤. Awakening..."
    sudo systemctl start docker
    if [ $? -ne 0 ]; then
        echo "Failed to start the docker service." >&2
        exit 1
    fi
    docker stop $(docker ps -a -q)
    echo "Stoped 🛑 all docker containers"
fi

exec docker "$@"

