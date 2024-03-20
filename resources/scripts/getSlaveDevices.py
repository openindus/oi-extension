

import json
import sys
from OISerial import OISerial

result = {
  "devices": []
}


# open port
# print(sys.argv[1])
com = OISerial(sys.argv[1])

if (com.connect()):
    data = com.getSlaves()
    result["devices"] = data
    com.disconnect()

print(json.dumps(result))

exit(0)