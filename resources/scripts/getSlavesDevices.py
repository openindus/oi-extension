import sys
import serial
import deviceTypeList

serialPort = serial.Serial(baudrate=115200, timeout=0.1)
serialPort.dtr = False
serialPort.rts = False
serialPort.port = sys.argv[1].split()[0] # first arg is for port number (ex: COM8)
