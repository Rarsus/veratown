#!/usr/bin/env python3
from lzstring import LZString
import sys

if len(sys.argv) != 2:
    print("Usage: decode.py <lzstring_base64>")
    sys.exit(1)

lz = LZString()
decoded = lz.decompressFromBase64(sys.argv[1])
print(decoded if decoded is not None else "Invalid or corrupted data")

