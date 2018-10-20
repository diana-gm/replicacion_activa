try {
    var zmq = require('zeromq');
}
catch(err) {
    var zmq = require('zmq');
}
var CONFIG = require('./constants.js');

var routerLadoClients = zmq.socket('dealer');
var socketLadoWorkers = zmq.socket('dealer');
var socketTotalOrder = zmq.socket('dealer');

if( process.argv.length < 3) {
	console.log('Parametros incorrectos');
	console.log('Modo de ejecucion: node handler.js IDHANDLER (>=1)');
	process.exit(1);
}

var id = process.argv[2];
var fullid = 'handler' + id;

console.log(fullid + ' launched');

var logger = zmq.socket('push');
logger.connect(CONFIG.IP_LOGGER);

var packets = {};
var packets_toBeHandled = {};
var lastServedReq = -1;

routerLadoClients.identity = 'handler' + id;
routerLadoClients.connect(CONFIG.IP_ROUTER1_HANDLER);

socketLadoWorkers.identity = 'handler' + id;
socketLadoWorkers.connect(CONFIG.IP_ROUTER2_HANDLER);

socketTotalOrder.identity = 'handler' + id;
socketTotalOrder.connect(CONFIG.IP_TOTALORDER);

routerLadoClients.on('message', function(sender, packetRaw) {
	var packetString = packetRaw.toString();
	console.log('H-' + id + ':Handler received: ' + packetString);
	var packet = JSON.parse(packetString);
	var newPacket = {
		id: packet.id,
		message: packet.message,
		source: 'handler' + id,
		target: 'workers',	// Posiblemente broadcast también a handlers
		producer: packet.source,
		type: 'handler_request'
	}
	logger.send([fullid, 'Receive request: ' + packet.id]);
	packets_toBeHandled[newPacket.id]=true;
	socketTotalOrder.send(JSON.stringify(newPacket));
});

socketLadoWorkers.on('message', function(sender, packetRaw) {
	var packetString = packetRaw.toString();
	console.log('H-' + id + ':Handler received: ' + packetString);
	var packet = JSON.parse(packetString);
	if (packet.id in packets_toBeHandled) {
		delete packets_toBeHandled[packet.id];
		var newPacket = packet;
		newPacket.target = packet.producer;
		logger.send([fullid, 'Send response to client: ' + packet.id]);
		routerLadoClients.send(JSON.stringify(newPacket));
	}
});

socketTotalOrder.on('message', function(sender, packetRaw) {
	var packetString = packetRaw.toString();
	var packet = JSON.parse(packetString);
	console.log('H-' + id + ':Total order received: ' + packetString);
	var order = packet.seq;
	console.log('H-' + id + ':Total order for [' + packet.id + ']: ' + order);
	
	packets[packet.seq] = packetString;
	
	if (packet.source == 'handler' + id) {
		if (packet.seq == lastServedReq + 1) {
			socketLadoWorkers.send(JSON.stringify(packet));
			lastServedReq += 1;
		}
		else {
			while(packet.seq > lastServedReq + 1) {
				logger.send([fullid, 'Send to workers: [' + packet.seq + ']' + packetToSend.id]);
				var packetToSend = packets[lastServedReq + 1];
				socketLadoWorkers.send(JSON.stringify(packetToSend));
				lastServedReq += 1;
			}
		}
	}
});
