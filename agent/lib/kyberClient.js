// kyberClient.js — native gRPC client for Kyber's public API.
// Mirrors what the open-source Kyber launcher does (package:grpc over HTTP/2 TLS
// to api-rpc.prod.kyber.gg), reimplemented with @grpc/grpc-js.

const path = require('path');
const protoLoader = require('@grpc/proto-loader');
const grpc = require('@grpc/grpc-js');

const PROTO_ROOT = path.join(__dirname, '..', 'proto');
const API_PROTO = path.join(PROTO_ROOT, 'Proto', 'kyber_api.proto');

const HOST = process.env.KYBER_HOST || 'api-rpc.prod.kyber.gg:443';

// StatsSource enum (from kyber_api.proto)
const StatsSource = { EA_PC: 0, EA_XBOX: 1, EA_PS4: 2, KYBER: 3, PERSONAL: 4 };

function load() {
  const pkgDef = protoLoader.loadSync(API_PROTO, {
    keepCase: true,
    longs: String,
    enums: Number,
    defaults: true,
    oneofs: true,
    includeDirs: [PROTO_ROOT],
  });
  return grpc.loadPackageDefinition(pkgDef).kyber_api;
}

class KyberClient {
  constructor({ host = HOST, token = process.env.KYBER_TOKEN || null } = {}) {
    this.host = host;
    this.token = token;
    const api = load();
    const creds = grpc.credentials.createSsl();
    this.stats = new api.Statistics(host, creds);
    this.browser = new api.ServerBrowser(host, creds);
  }

  _meta() {
    const m = new grpc.Metadata();
    if (this.token) m.set('authorization', this.token);
    return m;
  }

  _call(stub, method, req) {
    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + 15000);
      stub[method](req, this._meta(), { deadline }, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    });
  }

  // Resolve in-game names -> { id, username } list.
  searchUser(query) {
    return this._call(this.stats, 'SearchUser', { query });
  }

  // Kyber-tracked stats for a user id. Returns { stats: { key: float } }.
  getKyberStats(userId) {
    return this._call(this.stats, 'GetStats', { source: StatsSource.KYBER, user: userId });
  }

  // EA/Frostbite career stats by persona id.
  getEaStats(personaId) {
    return this._call(this.stats, 'GetStats', {
      source: StatsSource.EA_PC, personaId: String(personaId),
    });
  }

  // Server browser. name filters by substring; page is 0-based.
  getServers({ name = '', page = 0 } = {}) {
    return this._call(this.browser, 'GetServers', { name, page });
  }
}

module.exports = { KyberClient, StatsSource, HOST };

