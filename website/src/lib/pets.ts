import { Sprite, ready } from './sprite';
import { host } from './dom';

/** Every place on the page where Tito lives. */
export interface Pets {
  logo: Sprite | null;
  hero: Sprite | null;
  how: Sprite | null;
  try: Sprite | null;
  off: Sprite | null;
  foot: Sprite | null;
  buddy: Sprite | null;
}

function make(id: string, scale: number): Sprite | null {
  const el = host(id);
  return el ? new Sprite(el, scale) : null;
}

export async function createPets(): Promise<Pets> {
  await ready;
  const pets: Pets = {
    logo: make('logoTito', 0.17),
    hero: make('heroTito', 1.34),
    how: make('sceneTito', 0.82),
    try: make('tryPet', 0.6),
    off: make('offPet', 1.0),
    foot: make('footPet', 1.15),
    buddy: make('buddyPet', 0.55),
  };
  pets.logo?.play('idle', { boing: false });
  pets.how?.play('listening', { boing: false });
  pets.try?.play('idle', { boing: false });
  pets.foot?.play('idle', { boing: false });
  pets.buddy?.play('idle', { boing: false });
  return pets;
}
