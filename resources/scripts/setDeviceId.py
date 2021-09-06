import serial
import sys

serialPort = serial.Serial(baudrate=115200, timeout=0.1)
serialPort.dtr = False
serialPort.rts = False
serialPort.port = sys.argv[1].split()[0] # first arg is for port number (ex: COM8)
id = int(sys.argv[2]) # second arg is for id

try:
    # open port
    serialPort.open()

    # flush I/O
    serialPort.flushInput()
    serialPort.flushOutput()
    
    # set id
    cmd = 'set-id %s\r\n' % id
    serialPort.write(bytes(cmd, 'utf-8'))
    serialPort.readline()
    
    # read back id
    serialPort.write(b"get-id\r\n")
    serialPort.readline()
    serialPort.readline()
    result = serialPort.readline()

    expected = '%s\r\n' % id
    
    if result != bytes(expected, 'utf-8'):
        returnCode = -1
    else:
        returnCode = 0
except:
    returnCode = -1

# close port
serialPort.close()

exit(returnCode)