#!/usr/bin/env python3
"""Build a release-signed APK using aapt2 (modern resource compiler).

Key fix: uses --auto-add-overlay to handle base resources correctly with aapt2.
"""

import os
import shutil
import subprocess
import sys
import zipfile

SDK = r"C:\Users\roy18\AppData\Local\Android\Sdk"
BUILD_TOOLS = os.path.join(SDK, "build-tools", "35.0.0")
PLATFORM_JAR = os.path.join(SDK, "platforms", "android-35", "android.jar")

PROJECT = r"c:\kimi\修仙与地下城"
MANUAL_BUILD_SRC = os.path.join(PROJECT, "android-manual-build")
KEYSTORE = os.path.join(PROJECT, "android", "release.keystore")
KEY_ALIAS = "xiuxian-release"
KEY_PASS = "xiuxian2026"
OUTPUT_APK = os.path.join(PROJECT, "修仙与地下城.apk")

AAPT2 = os.path.join(BUILD_TOOLS, "aapt2.exe")
APKSIGNER = os.path.join(BUILD_TOOLS, "apksigner.bat")
ZIPALIGN = os.path.join(BUILD_TOOLS, "zipalign.exe")

TEMP_BUILD = r"C:\temp\xiuxian_build"


def run(cmd):
    print(f"\n> {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.stdout:
        print(result.stdout[:3000])
    if result.returncode != 0:
        print(f"STDERR: {result.stderr[:3000]}")
        raise RuntimeError(f"Command failed: {cmd}")
    return result.stdout


def step1_compile_resources(build_dir):
    print("\n=== Step 1: Compile resources with aapt2 ===")
    res_dir = os.path.join(build_dir, "res")
    out_zip = os.path.join(build_dir, "compiled-res.zip")
    if os.path.exists(out_zip):
        os.remove(out_zip)
    cmd = f'"{AAPT2}" compile --dir "{res_dir}" -o "{out_zip}"'
    run(cmd)
    print(f"Compiled resources zip: {os.path.getsize(out_zip)} bytes")
    return out_zip


def step2_link_resources(build_dir, compiled_res_zip):
    print("\n=== Step 2: Link resources with aapt2 ===")
    manifest = os.path.join(build_dir, "AndroidManifest.xml")
    assets_dir = os.path.join(build_dir, "assets")
    out_apk = os.path.join(build_dir, "linked.apk")
    if os.path.exists(out_apk):
        os.remove(out_apk)
    cmd = (
        f'"{AAPT2}" link '
        f'-I "{PLATFORM_JAR}" '
        f'--manifest "{manifest}" '
        f'-R "{compiled_res_zip}" '
        f'--auto-add-overlay '
        f'-o "{out_apk}" '
        f'--min-sdk-version 23 '
        f'--target-sdk-version 35 '
        f'-A "{assets_dir}"'
    )
    run(cmd)
    print(f"Linked APK size: {os.path.getsize(out_apk)} bytes")
    return out_apk


def step3_add_dex(build_dir, linked_apk, dex_path):
    print("\n=== Step 3: Add classes.dex and fix paths ===")
    temp_apk = os.path.join(build_dir, "with_dex.apk")

    with zipfile.ZipFile(linked_apk, 'r') as zin:
        with zipfile.ZipFile(temp_apk, 'w', zipfile.ZIP_DEFLATED) as zout:
            for item in zin.namelist():
                data = zin.read(item)
                clean_name = item.replace('\\', '/')
                zout.writestr(clean_name, data)

            if os.path.exists(dex_path):
                with open(dex_path, 'rb') as f:
                    zout.writestr('classes.dex', f.read())
                print("  Added: classes.dex")
            else:
                print("  ERROR: classes.dex not found!")
                sys.exit(1)

    print(f"APK with dex size: {os.path.getsize(temp_apk)} bytes")
    return temp_apk


def step4_zipalign(apk_path, out_path):
    print("\n=== Step 4: zipalign ===")
    if os.path.exists(out_path):
        os.remove(out_path)
    cmd = f'"{ZIPALIGN}" -f -v 4 "{apk_path}" "{out_path}"'
    run(cmd)
    print(f"Aligned APK size: {os.path.getsize(out_path)} bytes")


def step5_sign(apk_path, out_path):
    print("\n=== Step 5: Sign with apksigner (release keystore) ===")
    if os.path.exists(out_path):
        os.remove(out_path)
    cmd = (
        f'"{APKSIGNER}" sign '
        f'--ks "{KEYSTORE}" '
        f'--ks-key-alias "{KEY_ALIAS}" '
        f'--ks-pass pass:{KEY_PASS} '
        f'--key-pass pass:{KEY_PASS} '
        f'--v1-signing-enabled true '
        f'--v2-signing-enabled true '
        f'--v3-signing-enabled true '
        f'--out "{out_path}" '
        f'"{apk_path}"'
    )
    run(cmd)
    print(f"Signed APK size: {os.path.getsize(out_path)} bytes")


def step6_verify(apk_path):
    print("\n=== Step 6: Verify signature ===")
    cmd = f'"{APKSIGNER}" verify --print-certs --verbose "{apk_path}"'
    output = run(cmd)
    print(output)


def main():
    print("=== 修仙与地下城 · Release APK 构建 (aapt2) ===")

    for tool, path in [("aapt2", AAPT2), ("apksigner", APKSIGNER), ("zipalign", ZIPALIGN)]:
        if not os.path.exists(path):
            print(f"ERROR: {tool} not found at {path}")
            sys.exit(1)

    dex_src = os.path.join(MANUAL_BUILD_SRC, "build", "dex", "classes.dex")
    if not os.path.exists(dex_src):
        print(f"ERROR: classes.dex not found at {dex_src}")
        sys.exit(1)

    if not os.path.exists(KEYSTORE):
        print(f"ERROR: keystore not found at {KEYSTORE}")
        sys.exit(1)

    if os.path.exists(TEMP_BUILD):
        shutil.rmtree(TEMP_BUILD)
    print(f"\nCopying to temp build dir: {TEMP_BUILD}")
    shutil.copytree(MANUAL_BUILD_SRC, TEMP_BUILD)

    dex_dst = os.path.join(TEMP_BUILD, "build", "dex", "classes.dex")
    os.makedirs(os.path.dirname(dex_dst), exist_ok=True)
    shutil.copy2(dex_src, dex_dst)

    compiled_zip = step1_compile_resources(TEMP_BUILD)
    linked_apk = step2_link_resources(TEMP_BUILD, compiled_zip)
    with_dex = step3_add_dex(TEMP_BUILD, linked_apk, dex_dst)
    aligned_apk = os.path.join(TEMP_BUILD, "aligned.apk")
    step4_zipalign(with_dex, aligned_apk)
    step5_sign(aligned_apk, OUTPUT_APK)
    step6_verify(OUTPUT_APK)

    shutil.rmtree(TEMP_BUILD, ignore_errors=True)

    print(f"\n=== BUILD COMPLETE ===")
    print(f"Output: {OUTPUT_APK}")
    print(f"Size: {os.path.getsize(OUTPUT_APK) / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
