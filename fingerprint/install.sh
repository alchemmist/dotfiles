#!/usr/bin/env bash
set -Eeuo pipefail

readonly DRIVER_REPOSITORY=https://github.com/Sbenazar/goodix-5f10-libfprint.git
readonly DRIVER_COMMIT=c2a779a4605c81eb78cf02ba02b8f8063a580e94
readonly PSK_REPOSITORY=https://github.com/Sbenazar/goodix-5f10-psk.git
readonly PSK_COMMIT=d2d2c6eec98a737e62a3b52a2c34b3e5f1b39c03
readonly SENSOR_ID=27c6:5f10
readonly PREFIX=/opt/goodix-5f10
readonly PSK_DEST=/var/lib/fprint/goodix-5f10/psk
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
readonly SCRIPT_DIR

windows_device=/dev/nvme0n1p3
windows_root=
psk_file=
skip_packages=false
skip_enroll=false
mounted_by_us=false
workdir=
mount_dir=

usage() {
    cat <<'EOF'
Usage: ./fingerprint/install.sh [options]

Options:
  --windows-device DEVICE  Windows partition used for PSK recovery
                           (default: /dev/nvme0n1p3)
  --windows-root DIR       Already-mounted Windows root; it must be read-only
  --psk-file FILE          Restore a private 32-byte PSK backup instead
  --skip-packages          Do not run pacman
  --skip-enroll            Do not start interactive finger enrollment
  -h, --help               Show this help

The installer never writes to the Windows partition and never prints the PSK.
EOF
}

cleanup() {
    if [[ $mounted_by_us == true && -n $mount_dir ]]; then
        sudo umount -- "$mount_dir" || true
        sudo rmdir -- "$mount_dir" || true
    fi
    if [[ -n $workdir && $workdir == /tmp/goodix-5f10.* ]]; then
        rm -rf -- "$workdir"
    fi
}
trap cleanup EXIT

while (($#)); do
    case $1 in
        --windows-device)
            windows_device=${2:?missing device after --windows-device}
            shift 2
            ;;
        --windows-root)
            windows_root=${2:?missing directory after --windows-root}
            shift 2
            ;;
        --psk-file)
            psk_file=${2:?missing file after --psk-file}
            shift 2
            ;;
        --skip-packages)
            skip_packages=true
            shift
            ;;
        --skip-enroll)
            skip_enroll=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            printf 'Unknown option: %s\n' "$1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

if [[ -n $windows_root && -n $psk_file ]]; then
    printf '%s\n' '--windows-root and --psk-file are mutually exclusive' >&2
    exit 2
fi

if [[ $skip_packages == false ]]; then
    sudo pacman -S --needed \
        base-devel git meson ninja glib2-devel libgusb openssl pixman \
        libgudev fprintd python python-pip
fi

for command in git meson ninja python sudo lsusb; do
    command -v "$command" >/dev/null || {
        printf 'Required command is missing: %s\n' "$command" >&2
        exit 1
    }
done

if ! lsusb -d "$SENSOR_ID" >/dev/null; then
    printf 'Goodix sensor %s was not found. Refusing to install.\n' "$SENSOR_ID" >&2
    exit 1
fi

workdir=$(mktemp -d /tmp/goodix-5f10.XXXXXXXX)
driver_source=$workdir/libfprint
psk_tools=$workdir/psk-tools
build_dir=$workdir/build

git clone --quiet "$DRIVER_REPOSITORY" "$driver_source"
git -C "$driver_source" checkout --quiet --detach "$DRIVER_COMMIT"
[[ $(git -C "$driver_source" rev-parse HEAD) == "$DRIVER_COMMIT" ]]

git clone --quiet "$PSK_REPOSITORY" "$psk_tools"
git -C "$psk_tools" checkout --quiet --detach "$PSK_COMMIT"
[[ $(git -C "$psk_tools" rev-parse HEAD) == "$PSK_COMMIT" ]]

python -m venv "$workdir/venv"
"$workdir/venv/bin/pip" install --disable-pip-version-check \
    --requirement "$SCRIPT_DIR/requirements.txt"

meson setup "$build_dir" "$driver_source" \
    -Dprefix="$PREFIX" -Dlibdir=lib -Ddoc=false \
    -Dgtk-examples=false -Dintrospection=false
ninja -C "$build_dir"
"$build_dir/libfprint/fprint-list-supported-devices" | grep -F "$SENSOR_ID" >/dev/null

if [[ -n $psk_file ]]; then
    [[ -f $psk_file ]] || { printf 'PSK backup not found: %s\n' "$psk_file" >&2; exit 1; }
    [[ $(stat -c %s -- "$psk_file") == 32 ]] || {
        printf 'PSK backup must contain exactly 32 raw bytes.\n' >&2
        exit 1
    }
    sudo install -D -o root -g root -m 0600 -- "$psk_file" "$PSK_DEST"
elif sudo test -f "$PSK_DEST" && [[ $(sudo stat -c %s -- "$PSK_DEST") == 32 ]]; then
    printf 'Reusing the existing protected PSK at %s.\n' "$PSK_DEST"
else
    if [[ -z $windows_root ]]; then
        [[ -b $windows_device ]] || {
            printf 'Windows device not found: %s\n' "$windows_device" >&2
            printf 'Use --psk-file or --windows-device.\n' >&2
            exit 1
        }
        existing_mount=$(findmnt -rn -S "$windows_device" -o TARGET | head -n 1 || true)
        if [[ -n $existing_mount ]]; then
            existing_options=$(findmnt -rn -T "$existing_mount" -o OPTIONS)
            [[ ,$existing_options, == *,ro,* ]] || {
                printf 'Existing Windows mount is not read-only: %s\n' "$existing_mount" >&2
                exit 1
            }
            windows_root=$existing_mount
        else
            mount_dir=/run/goodix-5f10-windows
            sudo install -d -m 0700 -- "$mount_dir"
            sudo mount -t ntfs3 -o ro,nosuid,nodev,noexec -- "$windows_device" "$mount_dir"
            mounted_by_us=true
            windows_root=$mount_dir
        fi
    fi

    root_options=$(findmnt -rn -T "$windows_root" -o OPTIONS)
    [[ ,$root_options, == *,ro,* ]] || {
        printf 'Windows root must be mounted read-only: %s\n' "$windows_root" >&2
        exit 1
    }
    sudo "$workdir/venv/bin/python" "$SCRIPT_DIR/install-psk.py" \
        --psk-tools-dir "$psk_tools" --windows-root "$windows_root"
fi

sudo install -d -m 0755 -- "$PREFIX/lib" /etc/systemd/system/fprintd.service.d
sudo install -m 0755 -- "$build_dir/libfprint/libfprint-2.so.2.0.0" \
    "$PREFIX/lib/libfprint-2.so.2.0.0"
sudo ln -sfn libfprint-2.so.2.0.0 "$PREFIX/lib/libfprint-2.so.2"
sudo install -m 0644 -- "$SCRIPT_DIR/fprintd-overlay.conf" \
    /etc/systemd/system/fprintd.service.d/10-goodix-5f10.conf
sudo systemctl daemon-reload
sudo systemctl restart fprintd.service

fprintd-list "$USER" || true
if [[ $skip_enroll == false ]]; then
    printf '\nTouch the right index finger when prompted. Enrollment needs 24 accepted samples.\n'
    fprintd-enroll -f right-index-finger
    fprintd-verify -f right-index-finger
fi

printf '\nGoodix %s installation complete.\n' "$SENSOR_ID"
