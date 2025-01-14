import { Component, Inject, OnInit } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Device } from '../../../../types/novacom';
import { CrashReport, DeviceManagerService } from '../../../core/services';

@Component({
  selector: 'app-crashes',
  templateUrl: './crashes.component.html',
  styleUrls: ['./crashes.component.scss']
})
export class CrashesComponent implements OnInit {

  reports: CrashReport[];

  constructor(
    public modal: NgbActiveModal,
    private deviceManager: DeviceManagerService,
    @Inject('device') private device: Device
  ) { }

  ngOnInit(): void {
    this.deviceManager.listCrashReports(this.device.name).then(reports => {
      this.reports = reports;
    });
  }

}
