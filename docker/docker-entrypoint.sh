#!/bin/sh
# Resolve the backend address dynamically.
# When the backend runs with network_mode: host (inside the Docker VM),
# it is reachable from other containers via the default gateway of the
# container's bridge network — NOT via host-gateway (which points to macOS).

if [ -z "$BACKEND_HOST" ]; then
    # Try the "backend" hostname first (works when both containers are on
    # the same Docker bridge network, i.e. no network_mode: host).
    if getent hosts backend >/dev/null 2>&1; then
        BACKEND_HOST="backend"
    else
        # Fallback: use the container's default gateway (= Docker VM host
        # interface where network_mode: host containers listen).
        BACKEND_HOST=$(ip route | awk '/default/ { print $3 }')
    fi
fi

export BACKEND_HOST
echo "nginx: proxying to backend at ${BACKEND_HOST}:8000"

# Substitute the variable into the nginx config template
envsubst '${BACKEND_HOST}' < /etc/nginx/conf.d/default.conf.template \
    > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
