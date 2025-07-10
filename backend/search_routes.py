#!/usr/bin/env python3
import re

with open('server.js', 'r') as f:
    lines = f.readlines()

print("=== Route imports (require statements) ===")
for i, line in enumerate(lines, 1):
    if 'require' in line and ('routes/' in line or 'Routes' in line):
        print(f"Line {i}: {line.strip()}")

print("\n=== Route mounting (app.use statements) ===")
for i, line in enumerate(lines, 1):
    if 'app.use' in line and ('/api' in line or 'Routes' in line):
        print(f"Line {i}: {line.strip()}")

print("\n=== Specific route files mentioned ===")
for i, line in enumerate(lines, 1):
    if any(route in line for route in ['ai-chat', 'document-analyzer', 'geocoding']):
        print(f"Line {i}: {line.strip()}")