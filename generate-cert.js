import { writeFile } from 'fs/promises';
import forge from 'node-forge';

async function saveCerts() {
  try {
    console.log("Generating certificates with node-forge...");

    // Generate a keypair and create an X.509v3 certificate
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1); // 1 year validity
    
    const attrs = [{
      name: 'commonName',
      value: 'localhost'
    }, {
      name: 'countryName',
      value: 'US'
    }, {
      shortName: 'ST',
      value: 'Virginia'
    }, {
      name: 'localityName',
      value: 'Blacksburg'
    }, {
      name: 'organizationName',
      value: 'Test'
    }, {
      shortName: 'OU',
      value: 'Test'
    }];
    
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    
    // Sign the certificate
    cert.sign(keys.privateKey, forge.md.sha256.create());

    // Convert to PEM format
    const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
    const certPem = forge.pki.certificateToPem(cert);

    await writeFile('cert.pem', certPem);
    await writeFile('key.pem', privateKeyPem);
    
    console.log('✅ Certificates generated successfully: cert.pem, key.pem');

  } catch (err) {
    console.error('❌ Error saving certificates:', err);
  }
}

saveCerts();