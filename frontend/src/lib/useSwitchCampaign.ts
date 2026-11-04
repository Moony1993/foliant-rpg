import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useCampaignStore } from '../store/campaign';

/** Switch the campaign on screen: drop every cached query (they belong to the old campaign) and go home.
 *  App reconnects the live connection because it depends on the campaign id. */
export function useSwitchCampaign() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const setCampaignId = useCampaignStore((s) => s.setCampaignId);
  return (id: number) => {
    setCampaignId(id);
    qc.resetQueries();
    navigate('/');
  };
}
