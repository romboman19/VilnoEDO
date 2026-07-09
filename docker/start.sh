#!/bin/sh

printf "🚀 Starting VilnoEDO...\n\n"

# 🇺🇦 VilnoEDO is UA-only: the legally meaningful signature is the Ukrainian
# КЕП/УЕП/electronic seal, created client-side via the IIT stack and verified
# separately. The upstream Documenso instance .p12 seal is not part of this
# flow, so it is intentionally NOT checked at startup — a missing .p12 does not
# affect Ukrainian signing.
printf "🇺🇦 Ukrainian trusted signing (КЕП/УЕП/печатка) — client-side via IIT\n"
printf "🏥 Health check: http://localhost:3000/api/health\n"
printf "📊 Signing status: http://localhost:3000/api/ua-trusted-signing/status\n\n"

printf "🗄️  Running database migrations...\n"
npx prisma migrate deploy --schema ../../packages/prisma/schema.prisma

printf "🌟 Starting VilnoEDO server...\n"
HOSTNAME=0.0.0.0 node build/server/main.js
