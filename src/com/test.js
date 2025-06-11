import { SerialPort, ReadlineParser, ReadyParser } from 'serialport';
import { setTimeout } from 'timers-promises';

const port = new SerialPort({path: "COM3", baudRate: 115200});

let readyParser = port.pipe(new ReadyParser({ delimiter: '>' }));
readyParser.on('ready', async () => {
    // port.setDTR(false); // Important
    // port.setRTS(false); // Important
    console.log('The ready byte sequence has been received');
    port.unpipe(readyParser);
});

const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
parser.on('data', (data) => {
    console.log('Received data:', data);
});
parser.on('error', (err) => {
    console.error('Parser error:', err);
});

port.on('open', async () => {
    console.log('Port opened successfully');
    for (let i = 0; i < 100000; i++) {
        port.write('read-id\n', (err) => {
            if (err) {
                return console.error('Error on write:', err.message);
            }
            console.log(i);
        });
        await setTimeout(10);
    }
});
    