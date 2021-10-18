import json
import serial
import serial.tools.list_ports

result = {
  "devices": []
}

serialPort = serial.Serial(baudrate=115200, timeout=0.1)
serialPort.dtr = False
serialPort.rts = False

l = list(serial.tools.list_ports.comports())

# iterate through all available ports
for port in l:
    
    # check if it is a silicon labs
    if (port.description[:38] == "Silicon Labs CP210x USB to UART Bridge"):

        # try to open the port
        try:
            # open port
            serialPort.port = port.device
            serialPort.open()

            # try to et the device type
            try:

                #flush I/O
                serialPort.flushInput()
                serialPort.flushOutput()
                
                # set log level
                serialPort.write(b"log-level 0\r\n")
                serialPort.readline()
                serialPort.readline()

                # get type
                serialPort.write(b"cmd 190\r\n") # CMD_GET_TYPE
                serialPort.readline()
                data = serialPort.readline()
                serialPort.readline()
                data = str(data, 'utf-8')

                # get name of board from type
                result["devices"].append({"port": port.device, "type": data[:-2]})

            except:
                result["devices"].append({"port": port.device, "type": "undefined"})
            
            serialPort.close()

        except:
            None

print(json.dumps(result))

exit(0)