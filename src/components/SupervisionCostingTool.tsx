import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Calculator, DollarSign, Info, AlertCircle } from 'lucide-react';
import type { SupervisionCost, TrainingLocation } from '../types/costing';
import { locations, perDiems, accommodations, supervisorCosts, landTransports, airTransports } from '../lib/api';
import { Plus, Trash2 } from 'lucide-react';

// Fallback data if API fails
const FALLBACK_LOCATIONS = [
  { id: 'fallback-1', name: 'Addis Ababa', region: 'Addis Ababa', is_hardship_area: false },
  { id: 'fallback-2', name: 'Adama', region: 'Oromia', is_hardship_area: false }
];

interface TransportRoute {
  id: string;
  transportId?: string;
  origin: string;
  destination: string;
  price: number;
  participants: number;
  originName?: string;
  destinationName?: string;
}

interface SupervisionLocation {
  locationId: string;
  days: number;
  supervisors: number;
}

interface SupervisionCostingToolProps {
  onCalculate: (costs: SupervisionCost) => void;
  onCancel: () => void;
  initialData?: SupervisionCost;
}

const SUPERVISOR_COSTS = [
  { value: 'ALL', label: 'All Additional Costs' },
  { value: 'TRAINING_MATERIALS', label: 'Training Materials' },
  { value: 'EQUIPMENT', label: 'Equipment' },
  { value: 'COMMUNICATION', label: 'Communication' },
  { value: 'OTHER', label: 'Other' }
];

const SupervisionCostingTool: React.FC<SupervisionCostingToolProps> = ({ 
  onCalculate,
  onCancel, 
  initialData 
}) => {
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationsData, setLocationsData] = useState<any[]>([]);
  const [perDiemsData, setPerDiemsData] = useState<any[]>([]);
  const [accommodationsData, setAccommodationsData] = useState<any[]>([]);
  const [supervisorCostsData, setSupervisorCostsData] = useState<any[]>([]);
  const [landTransportsData, setLandTransportsData] = useState<any[]>([]);
  const [airTransportsData, setAirTransportsData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [landTransportRoutes, setLandTransportRoutes] = useState<TransportRoute[]>([]);
  const [airTransportRoutes, setAirTransportRoutes] = useState<TransportRoute[]>([]);
  const [additionalLocations, setAdditionalLocations] = useState<SupervisionLocation[]>([]);
  const [apiBaseUrl, setApiBaseUrl] = useState<string>('');
  
  const { register, watch, control, setValue, handleSubmit, formState: { errors }, trigger, getValues } = useForm<SupervisionCost>({
    defaultValues: initialData || {
      description: '',
      numberOfDays: 1,
      numberOfSupervisors: 1,
      numberOfSessions: 1,
      numberOfSupervisorsWithAdditionalCost: 0,
      additionalSupervisorCosts: [],
      transportRequired: false,
      landTransportSupervisors: 0,
      airTransportSupervisors: 0,
      otherCosts: 0
    }
  });

  // Watch all form values at once
  const allFormValues = watch();

  // ... existing functions ...

  // Calculate average transport costs
  const calculateAvgLandTransportCost = () => {
    if (!landTransportsData || landTransportsData.length === 0) return 1000;
    return 1000;
  };

  const calculateAvgAirTransportCost = () => {
    if (!airTransportsData || airTransportsData.length === 0) return 5000;
    return 5000;
  };

  // Memoize these values to avoid recalculating on every render
  const avgLandTransportCost = calculateAvgLandTransportCost();
  const avgAirTransportCost = calculateAvgAirTransportCost();

  // Re-validate transport supervisors when total supervisors changes
  useEffect(() => {
    if (allFormValues.transportRequired) {
      trigger(['landTransportSupervisors', 'airTransportSupervisors']);
    }
  }, [allFormValues.numberOfSupervisors, trigger, allFormValues.transportRequired]);

  // Calculate total budget whenever relevant data changes
  useEffect(() => {
    const calculateTotalBudget = () => {
      const locationId = allFormValues.trainingLocation;
      const days = allFormValues.numberOfDays || 0;
      const supervisors = allFormValues.numberOfSupervisors || 0;
      const numSessions = Number(allFormValues.numberOfSessions) || 1;
      
      // ... rest of the calculation logic (same as before) ...
    };

    calculateTotalBudget();
  }, [
    allFormValues,
    additionalLocations, 
    landTransportRoutes, 
    airTransportRoutes,
    perDiemsData,
    accommodationsData,
    supervisorCostsData,
    landTransportsData,
    airTransportsData,
    setValue
  ]);

  // ... rest of the component ...

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6 max-h-[75vh] overflow-y-auto p-2 pb-20">
      {/* ... existing JSX ... */}
      
      {/* Update all references to use allFormValues */}
      {allFormValues.transportRequired && (
        <div className="space-y-4">
          {/* ... transport UI ... */}
        </div>
      )}

      {/* ... existing JSX ... */}
    </form>
  );
};

export default SupervisionCostingTool;