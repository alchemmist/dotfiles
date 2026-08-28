# HONOR MagicBook fingerprint reader

Reproducible Arch Linux setup for the Goodix `27c6:5f10` power-button
fingerprint sensor. The sensor is not supported by upstream libfprint yet.

The installer builds the community driver in a temporary directory and installs
an isolated library under `/opt/goodix-5f10`. Only `fprintd` loads this library;
the Arch package at `/usr/lib/libfprint` is not overwritten.

## Install after reinstalling Arch

Keep the Windows partition with the official Goodix driver and cache, then run:

```sh
./fingerprint/install.sh
```

The default Windows partition on this laptop is `/dev/nvme0n1p3`. Override it
when the partition layout changes:

```sh
./fingerprint/install.sh --windows-device /dev/nvme0n1pX
```

The Windows filesystem is mounted read-only. Because impacket opens registry
hives as writable even for offline reads, the helper copies the required files
to a private temporary directory and decrypts those copies. The unique PSK is
written directly to `/var/lib/fprint/goodix-5f10/psk`, mode `0600`, without
printing it.

If Windows will also be removed, first make a private backup:

```sh
./fingerprint/backup-psk.sh /path/on/encrypted-or-external-storage/goodix-5f10.psk
```

Restore from it after reinstalling:

```sh
./fingerprint/install.sh --psk-file /private/path/goodix-5f10.psk
```

Never commit the PSK. `fingerprint/secrets/` is ignored, but an encrypted
external disk or password-manager attachment is safer. Fingerprint templates
are deliberately not backed up: this experimental driver stores raw fingerprint
images, so enroll again after reinstalling.

## Pinned sources

- Driver: `Sbenazar/goodix-5f10-libfprint` at
  `c2a779a4605c81eb78cf02ba02b8f8063a580e94`
- PSK recovery: `Sbenazar/goodix-5f10-psk` at
  `d2d2c6eec98a737e62a3b52a2c34b3e5f1b39c03`
- Python dependency: `impacket==0.13.0`

The commit hashes are verified before compilation. Updating either source is an
explicit edit followed by enrollment, genuine-finger, wrong-finger and Hyprlock
tests.

## Desktop integration

`hypr/hyprlock.conf` enables Hyprlock's native fingerprint D-Bus client. It can
listen for the fingerprint while password entry remains available in parallel.
Fingerprint authentication is intentionally not enabled for `sudo` or global
PAM because of fingerprint-hijacking concerns for privileged prompts.

## Check and remove

```sh
fprintd-list "$USER"
fprintd-verify -f right-index-finger
./fingerprint/uninstall.sh
```

Removal retains the PSK and enrolled templates under `/var/lib/fprint`.
