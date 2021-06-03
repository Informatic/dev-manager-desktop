import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AppsComponent } from './home/apps/apps.component';
import { FilesComponent } from './home/files/files.component';
import { HomeComponent } from './home/home.component';
import { InfoComponent } from './home/info/info.component';
import { TerminalComponent } from './home/terminal/terminal.component';
import { LunaMonitorComponent } from './home/monitor/monitor.component';


const routes: Routes = [
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: 'home', component: HomeComponent,
    children: [
      { path: 'apps', component: AppsComponent },
      { path: 'files', component: FilesComponent },
      { path: 'terminal', component: TerminalComponent },
      { path: 'info', component: InfoComponent },
      { path: 'monitor', component: LunaMonitorComponent },
      { path: '', redirectTo: 'apps', pathMatch: 'full' },
    ]
  },
  {
    path: '**',
    redirectTo: 'home'
  }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { relativeLinkResolution: 'legacy', useHash: true }),
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
