import type {MetadataRoute} from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {id:'/',name:'BartaCare',short_name:'BartaCare',start_url:'/',display:'standalone'};
}
