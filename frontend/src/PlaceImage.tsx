import { type Place, safeImage } from './lib';

// Collection belongs to the results page, never to an individual image or viewport observer.
export default function PlaceImage({ place, className }: { place: Place; className?: string }) {
  return <img className={className} src={safeImage(place.image)} alt={`${place.name} 사진`} loading="lazy"
    onError={e => { if (e.currentTarget.getAttribute('src') !== '/images/placeholder.svg') e.currentTarget.src = '/images/placeholder.svg'; }}/>;
}
