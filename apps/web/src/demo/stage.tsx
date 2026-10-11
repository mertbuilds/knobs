import { Cards } from '../lib/card.tsx';
import { AgentCard, DebugCard, NetworkCard, PointerCard, ViewportCard } from './device.tsx';
import {
  ContrastCard,
  MotionCard,
  SchemeCard,
  TextCard,
  TransparencyCard,
  VisionCard,
} from './look.tsx';
import { PickCard } from './pick.tsx';
import { LocaleCard, LocationCard, TimeCard } from './place.tsx';
import { RequestsCard } from './requests.tsx';
import { StorageCard } from './storage.tsx';

/**
 * One card per knob row and per view of the panel, in the panel's order. A
 * card never sets a knob: it shows what the page reads, so a knob moved in the
 * panel shows here. The only buttons are for what a page has to start itself:
 * a request, a write to storage, a dialog, a question to geolocation.
 */
export function Stage() {
  return (
    <Cards>
      <SchemeCard />
      <ContrastCard />
      <TransparencyCard />
      <VisionCard />
      <TextCard />
      <MotionCard />
      <LocaleCard />
      <TimeCard />
      <LocationCard />
      <NetworkCard />
      <ViewportCard />
      <PointerCard />
      <AgentCard />
      <DebugCard />
      <PickCard />
      <RequestsCard />
      <StorageCard />
    </Cards>
  );
}
