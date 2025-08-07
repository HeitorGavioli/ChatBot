// testeMongo.js
require('dotenv').config();
const mongoose = require('mongoose');

const mongoUri = process.env.MONGODB_URI;

console.log("-----------------------------------------");
console.log("INICIANDO TESTE DE CONEXÃO COM MONGODB...");
console.log("-----------------------------------------");

if (!mongoUri) {
    console.error("❌ ERRO FATAL: A variável MONGODB_URI não foi encontrada no seu arquivo .env!");
    process.exit(1);
}

// Mostra a URI sem a senha para verificação
console.log("URI que está sendo usada (verifique se o usuário e o cluster estão corretos):");
console.log(mongoUri.replace(/:([^:]+)@/, ':*****@'));
console.log("-----------------------------------------");

mongoose.connect(mongoUri)
  .then(() => {
      console.log("✅✅✅ SUCESSO! Conexão com MongoDB estabelecida!");
      mongoose.connection.close();
      process.exit(0);
  })
  .catch(err => {
      console.error("❌❌❌ FALHA AO CONECTAR. A causa raiz do erro é esta:");
      console.error(err);
      process.exit(1);
  });