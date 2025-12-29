import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const CERT_DIR = path.resolve("certs");
const keyPath = path.join(CERT_DIR, "key.pem");
const certPath = path.join(CERT_DIR, "cert.pem");
const cnfPath = path.join(CERT_DIR, "openssl.cnf");

// Change these if you want, but they are safe defaults for LAN dev
const LAN_IP = process.env.HOMEBEAM_IP || "192.168.68.50";
const LAN_NAME = process.env.HOMEBEAM_NAME || "homebeam";

function ensureDir() {
  if (!fs.existsSync(CERT_DIR)) fs.mkdirSync(CERT_DIR, { recursive: true });
}

function writeConfig() {
  const cnf = `
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
C=DE
ST=BW
L=LAN
O=HomeBeam
CN=${LAN_NAME}

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${LAN_NAME}
DNS.2 = localhost
IP.1 = ${LAN_IP}
IP.2 = 127.0.0.1
`.trim();
  fs.writeFileSync(cnfPath, cnf);
}

function generate() {
  console.log(`🔐 Generating TLS certs in ${CERT_DIR}`);
  console.log(`   Name: ${LAN_NAME}`);
  console.log(`   IP:   ${LAN_IP}`);

  execSync(
    `openssl req -x509 -nodes -days 825 -newkey rsa:2048 ` +
      `-keyout "${keyPath}" -out "${certPath}" -config "${cnfPath}"`,
    { stdio: "inherit" }
  );

  console.log("✅ Done.");
  console.log("   key:", keyPath);
  console.log("   crt:", certPath);
}

ensureDir();

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  console.log("✅ TLS certs already exist in ./certs — nothing to do.");
  process.exit(0);
}

writeConfig();
generate();
