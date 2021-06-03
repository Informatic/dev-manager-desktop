import { ChangeDetectorRef, Component, OnInit, Pipe, PipeTransform } from '@angular/core';
import { ClientChannel } from 'ssh2';
import {Session} from '../../../types/novacom';
import { DeviceManagerService } from '../../core/services/device-manager.service';
import { ElectronService } from '../../core/services/electron.service';

enum Direction {
  TX,
  RX,
};

enum MessageType {
  Call,
  Return,
};

interface LunaMessage {
  timestamp: number;
  direction: Direction;
  type: MessageType;
  token: number;

  sender: string;
  senderSock: string;
  destination: string;
  destinationSock: string;

  client: string;
  clientSock: string;
  service: string;
  serviceSock: string;

  appID?: string;
  method?: string;
  body: any;
};

interface LunaCall extends LunaMessage {
  responses: LunaMessage[];
};

@Pipe({name: 'monitorMapCalls'})
export class MonitorMapCallsPipe implements PipeTransform {
  transform(value: LunaMessage[]): LunaCall[] {
    const res = [];
    const lookup: {[k: string]: LunaCall}  = {};
    value.slice().reverse().forEach(msg => {
      if (msg.direction === Direction.RX) return;
      if (msg.method === '/com/palm/luna/private/cancel') {
        const key = `${msg.clientSock}:${msg.serviceSock}:${msg.body.token}`;
        if (key in lookup) {
          lookup[key].responses.push(msg);
        }
      } else {
        const key = `${msg.clientSock}:${msg.serviceSock}:${msg.token}`;
        if (msg.type === MessageType.Call) {
          lookup[key] = {
            ...msg,
            responses: [],
          };
          res.unshift(lookup[key]);
        } else if (key in lookup) {
          lookup[key].responses.push(msg);
        }
      }
    });

    return res;
  }
}

@Pipe({name: 'monitorFilter'})
export class MonitorFilterPipe implements PipeTransform {
  transform(value: LunaMessage[], filterSpec: any): LunaMessage[] {
    return value.filter((msg) => {
      if (msg.direction == Direction.TX && !filterSpec.tx) {
        return false;
      }

      if (msg.direction == Direction.RX && !filterSpec.rx) {
        return false;
      }

      if (msg.type == MessageType.Call && !filterSpec.call) {
        return false;
      }

      if (msg.type == MessageType.Return && !filterSpec.return) {
        return false;
      }

      if (filterSpec.client.length && !msg.client.startsWith(filterSpec.client)) {
        return false;
      }

      if (filterSpec.service.length && !msg.service.startsWith(filterSpec.service)) {
        return false;
      }

      return true;
    });
  }
}

@Component({
  selector: 'app-monitor',
  templateUrl: './monitor.component.html',
  styleUrls: ['./monitor.component.scss']
})
export class LunaMonitorComponent implements OnInit {
  monitorChannel?: ClientChannel = null;
  monitorSession?: Session = null;
  buffer: string = '';
  monitorReady: boolean = false;
  enumDirection = Direction;
  enumMessageType = MessageType;
  messagesUnfiltered: LunaMessage[] = [];

  filter = {
    tx: true,
    rx: false,
    call: true,
    return: true,
    client: '',
    service: '',
  };

  constructor(
    private electron: ElectronService,
    private deviceManager: DeviceManagerService,
    private changeDetector: ChangeDetectorRef,
  ) { }


  ngOnInit(): void {
    this.messagesUnfiltered = [];
    // this.startMonitor();
  }

  ngOnDestroy(): void {
    this.stopMonitor();
  }

  processData(data: string) {
    this.buffer += data;

    let matched = false;
    do {
      matched = false;
      const headerRe = new RegExp(/Time	Status\s+Prot\s+Type\s+Serial\s+Sender\s+Destination\s+Method\s+Payload\n/);
      const headerMatch = this.buffer.match(headerRe);
      if (headerMatch) {
        this.monitorReady = true;
        console.info('HEADER MATCH', headerMatch);
        if (headerMatch.index != 0) {
          console.info('Dropping data:', this.buffer.substring(0, headerMatch.index));
        }
        this.buffer = this.buffer.substring(headerMatch.index + headerMatch[0].length);
        matched = true;
      }

      const messageRe = new RegExp(/(?<ts>\d+\.\d+)\s+(?<dir>RX|TX)\s+(?<type>call|return)\s+(?<token>\d+)\s+(?<sender>[^\s]+)\s+\((?<sender_sock>[^)]+)\)\s+(?<destination>[^\s]*)\s+\((?<destination_sock>[^)]+)\)\s+(?:(?<app_id>[^\s]*)\s+(?<method>[^\s]+)\s+|)«(?<body>[^»]+)»\n/);
      const messageMatch = this.buffer.match(messageRe);
      if (messageMatch) {
        if (messageMatch.index != 0) {
          console.info('Dropping data:', this.buffer.substring(0, messageMatch.index));
        }
        const { groups } = messageMatch;
        const direction = groups.dir === 'RX' ? Direction.RX : Direction.TX;
        const type_ = groups.type === 'call' ? MessageType.Call : MessageType.Return;
        const flip = (direction === Direction.TX && type_ === MessageType.Call) || (direction === Direction.RX && type_ === MessageType.Return);
        const message = {
          direction,
          type: type_,
          timestamp: parseFloat(groups.ts),
          token: parseInt(groups.token),
          client: flip ? groups.sender : groups.destination,
          clientSock: flip ? groups.sender_sock : groups.destination_sock,
          service: flip ? groups.destination : groups.sender,
          serviceSock: flip ? groups.destination_sock : groups.sender_sock,

          sender: groups.sender,
          senderSock: groups.sender_sock,
          destination: groups.destination,
          destinationSock: groups.destination_sock,

          appID: groups.app_id,
          method: groups.method,
          body: JSON.parse(groups.body),
        };

        console.info('MESSAGE MATCH', message, messageMatch);

        this.messagesUnfiltered = [
          message,
          ...this.messagesUnfiltered,
        ];
        console.info(this.messagesUnfiltered.length);
        this.buffer = this.buffer.substring(messageMatch.index + messageMatch[0].length);
        matched = true;
      }
    } while (matched);
    this.changeDetector.detectChanges();
  }

  async startMonitor() {
    if (this.monitorSession !== null) {
      console.info('Monitor running already!');
      return;
    }

    const device = (await this.deviceManager.list()).find(dev => dev.default);
    this.monitorSession = await this.deviceManager.newSession(device.name);
    this.monitorSession.run('pkill -9 -f ls-monitor', null, null, null, (err, result) => {
      this.monitorSession.ssh.exec('/usr/sbin/ls-monitor', {}, (err, channel) => {
        this.monitorChannel = channel;
        channel.stdout.on('data', (data) => {
          this.processData(data.toString());
        });
        channel.stderr.on('data', (data) => {
          console.warn('stderr:', data.toString());
        });
        channel.on('exit', (evt) => {
          console.warn('Monitor exit!', evt);
        });
        channel.on('close', (evt) => {
          console.warn('Monitor closed!', evt);
          this.stopMonitor();
        });
        console.info(err, channel);
      });
    });
  }

  stopMonitor() {
    if (this.monitorSession) {
      console.info('Destroying...');
      this.monitorReady = false;
      this.monitorSession.end();
      this.monitorSession = null;
      this.monitorChannel.end();
      this.monitorChannel = null;
      this.changeDetector.detectChanges();
    }
  }

  clearMessages() {
    this.messagesUnfiltered = [];
  }

  copyCommand(call: LunaCall|LunaMessage) {
    const command = `luna-send ${('responses' in call && call.responses.length > 1) ? '-i' : '-n 1'} ${JSON.stringify(`luna://${call.service}${call.method}`)} ${JSON.stringify(JSON.stringify(call.body))}`;
    console.info(command);
    navigator.clipboard.writeText(command);
  }
}
