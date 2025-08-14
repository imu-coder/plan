from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import (
    Organization, OrganizationUser, StrategicObjective, 
    Program, StrategicInitiative, PerformanceMeasure, MainActivity,
    ActivityBudget, ActivityCostingAssumption, InitiativeFeed,
    Location, LandTransport, AirTransport, PerDiem, Accommodation,
    ParticipantCost, SessionCost, PrintingCost, SupervisorCost,
    ProcurementItem, Plan, PlanReview, SubActivity
)
from decimal import Decimal, InvalidOperation
import json

class OrganizationSerializer(serializers.ModelSerializer):
    parentId = serializers.IntegerField(source='parent_id', read_only=True)
    coreValues = serializers.ListField(source='core_values', read_only=True)
    
    class Meta:
        model = Organization
        fields = ['id', 'name', 'type', 'parent', 'parentId', 'vision', 'mission', 'core_values', 'coreValues', 'created_at', 'updated_at']

class OrganizationUserSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    
    class Meta:
        model = OrganizationUser
        fields = ['id', 'user', 'username', 'organization', 'organization_name', 'role', 'created_at']

class StrategicObjectiveSerializer(serializers.ModelSerializer):
    effective_weight = serializers.SerializerMethodField()
    programs = serializers.SerializerMethodField()
    initiatives = serializers.SerializerMethodField()
    total_initiatives_weight = serializers.SerializerMethodField()

    class Meta:
        model = StrategicObjective
        fields = [
            'id', 'title', 'description', 'weight', 'planner_weight', 'effective_weight',
            'is_default', 'created_at', 'updated_at', 'programs', 'initiatives', 
            'total_initiatives_weight'
        ]

    def get_effective_weight(self, obj):
        return obj.get_effective_weight()

    def get_programs(self, obj):
        programs = obj.programs.all()
        return ProgramSerializer(programs, many=True).data

    def get_initiatives(self, obj):
        initiatives = obj.initiatives.all()
        return StrategicInitiativeSerializer(initiatives, many=True, context=self.context).data

    def get_total_initiatives_weight(self, obj):
        return sum(initiative.weight for initiative in obj.initiatives.all())

class ProgramSerializer(serializers.ModelSerializer):
    strategic_objective_title = serializers.CharField(source='strategic_objective.title', read_only=True)
    initiatives = serializers.SerializerMethodField()

    class Meta:
        model = Program
        fields = ['id', 'name', 'description', 'strategic_objective', 'strategic_objective_title', 'is_default', 'created_at', 'updated_at', 'initiatives']

    def get_initiatives(self, obj):
        initiatives = obj.initiatives.all()
        return StrategicInitiativeSerializer(initiatives, many=True, context=self.context).data

class InitiativeFeedSerializer(serializers.ModelSerializer):
    strategic_objective_title = serializers.CharField(source='strategic_objective.title', read_only=True)
    
    class Meta:
        model = InitiativeFeed
        fields = ['id', 'name', 'description', 'strategic_objective', 'strategic_objective_title', 'is_active', 'created_at', 'updated_at']

class StrategicInitiativeSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    performance_measures = serializers.SerializerMethodField()
    main_activities = serializers.SerializerMethodField()
    total_measures_weight = serializers.SerializerMethodField()
    total_activities_weight = serializers.SerializerMethodField()
    initiative_feed_name = serializers.CharField(source='initiative_feed.name', read_only=True)

    class Meta:
        model = StrategicInitiative
        fields = [
            'id', 'name', 'weight', 'strategic_objective', 'program', 'organization', 
            'organization_name', 'is_default', 'initiative_feed', 'initiative_feed_name',
            'performance_measures', 'main_activities', 'total_measures_weight', 
            'total_activities_weight', 'created_at', 'updated_at'
        ]

    def get_performance_measures(self, obj):
        measures = obj.performance_measures.all()
        return PerformanceMeasureSerializer(measures, many=True).data

    def get_main_activities(self, obj):
        activities = obj.main_activities.all()
        return MainActivitySerializer(activities, many=True, context=self.context).data

    def get_total_measures_weight(self, obj):
        return sum(measure.weight for measure in obj.performance_measures.all())

    def get_total_activities_weight(self, obj):
        return sum(activity.weight for activity in obj.main_activities.all())

class PerformanceMeasureSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source='organization.name', read_only=True)

    class Meta:
        model = PerformanceMeasure
        fields = [
            'id', 'initiative', 'name', 'weight', 'baseline', 'target_type',
            'q1_target', 'q2_target', 'q3_target', 'q4_target', 'annual_target',
            'selected_months', 'selected_quarters', 'organization', 'organization_name',
            'created_at', 'updated_at'
        ]

    def validate(self, data):
        # Ensure organization is set from request user
        if not data.get('organization'):
            user = self.context['request'].user
            user_org = user.organization_users.first()
            if user_org:
                data['organization'] = user_org.organization

        # Validate period selection
        selected_months = data.get('selected_months', [])
        selected_quarters = data.get('selected_quarters', [])
        
        if not selected_months and not selected_quarters:
            raise serializers.ValidationError('At least one month or quarter must be selected')

        return data

class SubActivitySerializer(serializers.ModelSerializer):
    total_funding = serializers.SerializerMethodField()
    estimated_cost = serializers.SerializerMethodField()
    funding_gap = serializers.SerializerMethodField()

    class Meta:
        model = SubActivity
        fields = [
            'id', 'main_activity', 'name', 'activity_type', 'description',
            'budget_calculation_type', 'estimated_cost_with_tool', 'estimated_cost_without_tool',
            'government_treasury', 'sdg_funding', 'partners_funding', 'other_funding',
            'training_details', 'meeting_workshop_details', 'procurement_details',
            'printing_details', 'supervision_details', 'partners_details',
            'total_funding', 'estimated_cost', 'funding_gap',
            'created_at', 'updated_at'
        ]

    def get_total_funding(self, obj):
        return obj.total_funding

    def get_estimated_cost(self, obj):
        return obj.estimated_cost

    def get_funding_gap(self, obj):
        return obj.funding_gap

    def validate(self, data):
        # Validate that estimated cost is positive
        estimated_cost_with_tool = data.get('estimated_cost_with_tool', 0)
        estimated_cost_without_tool = data.get('estimated_cost_without_tool', 0)
        
        if estimated_cost_with_tool <= 0 and estimated_cost_without_tool <= 0:
            raise serializers.ValidationError('At least one estimated cost must be greater than 0')

        return data

class MainActivitySerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    sub_activities = SubActivitySerializer(many=True, read_only=True)
    total_budget = serializers.SerializerMethodField()
    total_funding = serializers.SerializerMethodField()
    funding_gap = serializers.SerializerMethodField()

    class Meta:
        model = MainActivity
        fields = [
            'id', 'initiative', 'name', 'weight', 'baseline', 'target_type',
            'q1_target', 'q2_target', 'q3_target', 'q4_target', 'annual_target',
            'selected_months', 'selected_quarters', 'organization', 'organization_name',
            'sub_activities', 'total_budget', 'total_funding', 'funding_gap',
            'created_at', 'updated_at'
        ]

    def get_total_budget(self, obj):
        return obj.total_budget

    def get_total_funding(self, obj):
        return obj.total_funding

    def get_funding_gap(self, obj):
        return obj.funding_gap

    def validate_weight(self, value):
        """Validate weight is positive and not exceeding 100"""
        try:
            weight = Decimal(str(value))
            if weight <= 0:
                raise serializers.ValidationError('Weight must be greater than 0')
            if weight > 100:
                raise serializers.ValidationError('Weight cannot exceed 100')
            return weight
        except (InvalidOperation, ValueError):
            raise serializers.ValidationError('Weight must be a valid number')

    def validate_name(self, value):
        """Validate name is not empty and reasonable length"""
        if not value or not value.strip():
            raise serializers.ValidationError('Activity name is required')
        
        if len(value.strip()) < 2:
            raise serializers.ValidationError('Activity name must be at least 2 characters')
            
        if len(value.strip()) > 255:
            raise serializers.ValidationError('Activity name cannot exceed 255 characters')
            
        return value.strip()

    def validate_baseline(self, value):
        """Validate baseline is not empty"""
        if not value or not value.strip():
            raise serializers.ValidationError('Baseline is required')
        return value.strip()

    def validate_target_type(self, value):
        """Validate target type is valid"""
        valid_types = ['cumulative', 'increasing', 'decreasing', 'constant']
        if value not in valid_types:
            raise serializers.ValidationError(f'Target type must be one of: {", ".join(valid_types)}')
        return value

    def validate_annual_target(self, value):
        """Validate annual target is positive"""
        try:
            target = Decimal(str(value))
            if target <= 0:
                raise serializers.ValidationError('Annual target must be greater than 0')
            return target
        except (InvalidOperation, ValueError):
            raise serializers.ValidationError('Annual target must be a valid number')

    def validate_q1_target(self, value):
        """Validate Q1 target is not negative"""
        try:
            target = Decimal(str(value))
            if target < 0:
                raise serializers.ValidationError('Q1 target cannot be negative')
            return target
        except (InvalidOperation, ValueError):
            raise serializers.ValidationError('Q1 target must be a valid number')

    def validate_q2_target(self, value):
        """Validate Q2 target is not negative"""
        try:
            target = Decimal(str(value))
            if target < 0:
                raise serializers.ValidationError('Q2 target cannot be negative')
            return target
        except (InvalidOperation, ValueError):
            raise serializers.ValidationError('Q2 target must be a valid number')

    def validate_q3_target(self, value):
        """Validate Q3 target is not negative"""
        try:
            target = Decimal(str(value))
            if target < 0:
                raise serializers.ValidationError('Q3 target cannot be negative')
            return target
        except (InvalidOperation, ValueError):
            raise serializers.ValidationError('Q3 target must be a valid number')

    def validate_q4_target(self, value):
        """Validate Q4 target is not negative"""
        try:
            target = Decimal(str(value))
            if target < 0:
                raise serializers.ValidationError('Q4 target cannot be negative')
            return target
        except (InvalidOperation, ValueError):
            raise serializers.ValidationError('Q4 target must be a valid number')

    def validate(self, data):
        """Cross-field validation"""
        # Ensure organization is set from request user if not provided
        if not data.get('organization'):
            user = self.context['request'].user
            user_org = user.organization_users.first()
            if user_org:
                data['organization'] = user_org.organization
            else:
                raise serializers.ValidationError('No organization found for user')

        # Validate period selection
        selected_months = data.get('selected_months', [])
        selected_quarters = data.get('selected_quarters', [])
        
        if not selected_months and not selected_quarters:
            raise serializers.ValidationError('At least one month or quarter must be selected')

        # Validate target consistency based on target_type
        target_type = data.get('target_type', 'cumulative')
        baseline = data.get('baseline', '')
        q1_target = Decimal(str(data.get('q1_target', 0)))
        q2_target = Decimal(str(data.get('q2_target', 0)))
        q3_target = Decimal(str(data.get('q3_target', 0)))
        q4_target = Decimal(str(data.get('q4_target', 0)))
        annual_target = Decimal(str(data.get('annual_target', 0)))

        # Validate targets based on target_type
        if target_type == 'cumulative':
            quarterly_sum = q1_target + q2_target + q3_target + q4_target
            if abs(quarterly_sum - annual_target) > Decimal('0.01'):
                raise serializers.ValidationError(
                    f'For cumulative targets, sum of quarterly targets ({quarterly_sum}) must equal annual target ({annual_target})'
                )
        elif target_type == 'increasing':
            if baseline and baseline.strip():
                try:
                    baseline_value = Decimal(baseline)
                    if q1_target < baseline_value:
                        raise serializers.ValidationError(
                            f'For increasing targets, Q1 target ({q1_target}) must be >= baseline ({baseline_value})'
                        )
                except (InvalidOperation, ValueError):
                    pass  # Skip validation if baseline is not a number
            
            if not (q1_target <= q2_target <= q3_target <= q4_target):
                raise serializers.ValidationError(
                    'For increasing targets, quarterly targets must be in ascending order (Q1 ≤ Q2 ≤ Q3 ≤ Q4)'
                )
            
            if abs(q4_target - annual_target) > Decimal('0.01'):
                raise serializers.ValidationError(
                    f'For increasing targets, Q4 target ({q4_target}) must equal annual target ({annual_target})'
                )
        elif target_type == 'decreasing':
            if baseline and baseline.strip():
                try:
                    baseline_value = Decimal(baseline)
                    if q1_target > baseline_value:
                        raise serializers.ValidationError(
                            f'For decreasing targets, Q1 target ({q1_target}) must be <= baseline ({baseline_value})'
                        )
                except (InvalidOperation, ValueError):
                    pass  # Skip validation if baseline is not a number
            
            if not (q1_target >= q2_target >= q3_target >= q4_target):
                raise serializers.ValidationError(
                    'For decreasing targets, quarterly targets must be in descending order (Q1 ≥ Q2 ≥ Q3 ≥ Q4)'
                )
            
            if abs(q4_target - annual_target) > Decimal('0.01'):
                raise serializers.ValidationError(
                    f'For decreasing targets, Q4 target ({q4_target}) must equal annual target ({annual_target})'
                )
        elif target_type == 'constant':
            if not (abs(q1_target - annual_target) < Decimal('0.01') and 
                   abs(q2_target - annual_target) < Decimal('0.01') and 
                   abs(q3_target - annual_target) < Decimal('0.01') and 
                   abs(q4_target - annual_target) < Decimal('0.01')):
                raise serializers.ValidationError(
                    f'For constant targets, all quarterly targets must equal annual target (Q1=Q2=Q3=Q4={annual_target})'
                )

        return data

    def create(self, validated_data):
        """Create new MainActivity with proper error handling"""
        try:
            # Ensure all required fields are present
            if not validated_data.get('initiative'):
                raise serializers.ValidationError('Initiative is required')
            
            if not validated_data.get('name'):
                raise serializers.ValidationError('Name is required')
            
            if not validated_data.get('weight'):
                raise serializers.ValidationError('Weight is required')
            
            # Create the instance
            instance = MainActivity.objects.create(**validated_data)
            return instance
        except DjangoValidationError as e:
            if hasattr(e, 'message_dict'):
                raise serializers.ValidationError(e.message_dict)
            else:
                raise serializers.ValidationError(str(e))
        except Exception as e:
            raise serializers.ValidationError(f'Failed to create main activity: {str(e)}')

    def update(self, instance, validated_data):
        """Update MainActivity with proper error handling"""
        try:
            # Update all fields
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            
            # Save with validation
            instance.save()
            return instance
        except DjangoValidationError as e:
            if hasattr(e, 'message_dict'):
                raise serializers.ValidationError(e.message_dict)
            else:
                raise serializers.ValidationError(str(e))
        except Exception as e:
            raise serializers.ValidationError(f'Failed to update main activity: {str(e)}')

class ActivityBudgetSerializer(serializers.ModelSerializer):
    total_funding = serializers.SerializerMethodField()
    estimated_cost = serializers.SerializerMethodField()
    funding_gap = serializers.SerializerMethodField()

    class Meta:
        model = ActivityBudget
        fields = [
            'id', 'activity', 'sub_activity', 'budget_calculation_type', 'activity_type',
            'estimated_cost_with_tool', 'estimated_cost_without_tool',
            'government_treasury', 'sdg_funding', 'partners_funding', 'other_funding',
            'training_details', 'meeting_workshop_details', 'procurement_details',
            'printing_details', 'supervision_details', 'partners_details',
            'total_funding', 'estimated_cost', 'funding_gap',
            'created_at', 'updated_at'
        ]

    def get_total_funding(self, obj):
        return obj.total_funding

    def get_estimated_cost(self, obj):
        return obj.estimated_cost

    def get_funding_gap(self, obj):
        return obj.funding_gap

class ActivityCostingAssumptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityCostingAssumption
        fields = '__all__'

# Location and transport serializers
class LocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = '__all__'

class LandTransportSerializer(serializers.ModelSerializer):
    origin_name = serializers.CharField(source='origin.name', read_only=True)
    destination_name = serializers.CharField(source='destination.name', read_only=True)

    class Meta:
        model = LandTransport
        fields = ['id', 'origin', 'destination', 'origin_name', 'destination_name', 'trip_type', 'price', 'created_at', 'updated_at']

class AirTransportSerializer(serializers.ModelSerializer):
    origin_name = serializers.CharField(source='origin.name', read_only=True)
    destination_name = serializers.CharField(source='destination.name', read_only=True)

    class Meta:
        model = AirTransport
        fields = ['id', 'origin', 'destination', 'origin_name', 'destination_name', 'price', 'created_at', 'updated_at']

class PerDiemSerializer(serializers.ModelSerializer):
    location_name = serializers.CharField(source='location.name', read_only=True)

    class Meta:
        model = PerDiem
        fields = ['id', 'location', 'location_name', 'amount', 'hardship_allowance_amount', 'created_at', 'updated_at']

class AccommodationSerializer(serializers.ModelSerializer):
    location_name = serializers.CharField(source='location.name', read_only=True)
    service_type_display = serializers.CharField(source='get_service_type_display', read_only=True)

    class Meta:
        model = Accommodation
        fields = ['id', 'location', 'location_name', 'service_type', 'service_type_display', 'price', 'created_at', 'updated_at']

class ParticipantCostSerializer(serializers.ModelSerializer):
    cost_type_display = serializers.CharField(source='get_cost_type_display', read_only=True)

    class Meta:
        model = ParticipantCost
        fields = ['id', 'cost_type', 'cost_type_display', 'price', 'created_at', 'updated_at']

class SessionCostSerializer(serializers.ModelSerializer):
    cost_type_display = serializers.CharField(source='get_cost_type_display', read_only=True)

    class Meta:
        model = SessionCost
        fields = ['id', 'cost_type', 'cost_type_display', 'price', 'created_at', 'updated_at']

class PrintingCostSerializer(serializers.ModelSerializer):
    document_type_display = serializers.CharField(source='get_document_type_display', read_only=True)

    class Meta:
        model = PrintingCost
        fields = ['id', 'document_type', 'document_type_display', 'price_per_page', 'created_at', 'updated_at']

class SupervisorCostSerializer(serializers.ModelSerializer):
    cost_type_display = serializers.CharField(source='get_cost_type_display', read_only=True)

    class Meta:
        model = SupervisorCost
        fields = ['id', 'cost_type', 'cost_type_display', 'amount', 'created_at', 'updated_at']

class ProcurementItemSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    unit_display = serializers.CharField(source='get_unit_display', read_only=True)

    class Meta:
        model = ProcurementItem
        fields = ['id', 'category', 'category_display', 'name', 'unit', 'unit_display', 'unit_price', 'created_at', 'updated_at']

class PlanReviewSerializer(serializers.ModelSerializer):
    evaluator_name = serializers.SerializerMethodField()

    class Meta:
        model = PlanReview
        fields = ['id', 'plan', 'evaluator', 'evaluator_name', 'status', 'feedback', 'reviewed_at']

    def get_evaluator_name(self, obj):
        if obj.evaluator and obj.evaluator.user:
            return f"{obj.evaluator.user.first_name} {obj.evaluator.user.last_name}".strip() or obj.evaluator.user.username
        return "System"

class PlanSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    objectives = serializers.SerializerMethodField()
    reviews = PlanReviewSerializer(many=True, read_only=True)

    class Meta:
        model = Plan
        fields = [
            'id', 'organization', 'organization_name', 'planner_name', 'type',
            'executive_name', 'strategic_objective', 'program', 'fiscal_year',
            'from_date', 'to_date', 'status', 'submitted_at', 'objectives', 'reviews',
            'created_at', 'updated_at'
        ]

    def get_objectives(self, obj):
        """Get all selected objectives with their complete data"""
        selected_objectives = obj.selected_objectives.all()
        
        # If no selected objectives, fall back to the single strategic_objective
        if not selected_objectives.exists() and obj.strategic_objective:
            selected_objectives = [obj.strategic_objective]
        
        return StrategicObjectiveSerializer(selected_objectives, many=True, context=self.context).data

class UserSerializer(serializers.ModelSerializer):
    userOrganizations = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'userOrganizations']

    def get_userOrganizations(self, obj):
        org_users = obj.organization_users.all()
        return [{
            'organization': org_user.organization.id,
            'organization_name': org_user.organization.name,
            'role': org_user.role
        } for org_user in org_users]

class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField()

    def validate(self, data):
        username = data.get('username')
        password = data.get('password')

        if username and password:
            user = authenticate(username=username, password=password)
            if not user:
                raise serializers.ValidationError('Invalid credentials')
            if not user.is_active:
                raise serializers.ValidationError('User account is disabled')
            data['user'] = user
        else:
            raise serializers.ValidationError('Must include username and password')

        return data

class ProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email']

    def validate_email(self, value):
        if value and User.objects.filter(email=value).exclude(id=self.instance.id if self.instance else None).exists():
            raise serializers.ValidationError('This email address is already in use.')
        return value

class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField()
    new_password = serializers.CharField(min_length=8)

    def validate_current_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value