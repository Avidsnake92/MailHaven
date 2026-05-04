#!/bin/bash
cd /root/mailvault
git pull origin main
bash build-frontend.sh
docker compose restart mailvault-backend
