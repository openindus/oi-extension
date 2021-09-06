import serial
import sys
import json

serialPort = serial.Serial(baudrate=115200, timeout=0.1)
serialPort.dtr = False
serialPort.rts = False
serialPort.port = sys.argv[1].split()[0] # first arg is for port number (ex: COM8)

try:
    # open port
    serialPort.open()

    # flush I/O
    serialPort.flushInput()
    serialPort.flushOutput()
    
    # read back id
    serialPort.write(b"get-id\r\n")
    serialPort.readline()
    result = serialPort.readline()
    result = int(result[:-2])
    returnCode = 0

except:
    returnCode = -1

# close port
serialPort.close()

print(json.dumps({"id": result}))

exit(returnCode)