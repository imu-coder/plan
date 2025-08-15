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
        # Filter performance measures by request user's organization
        measures = obj.performance_measures.all()
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            user_org = getattr(request.user, 'organization_users', None)
            if user_org and hasattr(user_org, 'first'):
                user_org_instance = user_org.first()
                if user_org_instance:
                    user_org_id = user_org_instance.organization_id
                    measures = measures.filter(
                        models.Q(organization__isnull=True) | 
                        models.Q(organization=user_org_id)
                    )
        return PerformanceMeasureSerializer(measures, many=True).data

    def get_main_activities(self, obj):
        # Filter main activities by request user's organization  
        activities = obj.main_activities.all()
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            user_org = getattr(request.user, 'organization_users', None)
            if user_org and hasattr(user_org, 'first'):
                user_org_instance = user_org.first()
                if user_org_instance:
                    user_org_id = user_org_instance.organization_id
                    activities = activities.filter(
                        models.Q(organization__isnull=True) | 
                        models.Q(organization=user_org_id)
                    )
        return MainActivitySerializer(activities, many=True, context=self.context).data

    def get_total_measures_weight(self, obj):
        # Calculate weight only for user's organization measures
        measures = obj.performance_measures.all()
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            user_org = getattr(request.user, 'organization_users', None)
            if user_org and hasattr(user_org, 'first'):
                user_org_instance = user_org.first()
                if user_org_instance:
                    user_org_id = user_org_instance.organization_id
                    measures = measures.filter(
                        models.Q(organization__isnull=True) | 
                        models.Q(organization=user_org_id)
                    )
        return sum(measure.weight for measure in measures)

    def get_total_activities_weight(self, obj):
        # Calculate weight only for user's organization activities
        activities = obj.main_activities.all()
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            user_org = getattr(request.user, 'organization_users', None)
            if user_org and hasattr(user_org, 'first'):
                user_org_instance = user_org.first()
                if user_org_instance:
                    user_org_id = user_org_instance.organization_id
                    activities = activities.filter(
                        models.Q(organization__isnull=True) | 
                        models.Q(organization=user_org_id)
                    )
        return sum(activity.weight for activity in activities)

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


    def validate(self, data):
        """Ensure organization is set, then let model handle weight validation"""
        # Set organization from authenticated user
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
        
        # Let Django model clean() method handle all weight validation
        return data
    
    def create(self, validated_data):
        """Create with proper error handling"""
        try:
            return super().create(validated_data)
        except DjangoValidationError as e:
            # Convert Django validation errors to DRF format
            raise serializers.ValidationError(e.messages)
    
    def update(self, instance, validated_data):
        """Update with proper error handling"""
        try:
            return super().update(instance, validated_data)
        except DjangoValidationError as e:
            # Convert Django validation errors to DRF format
            raise serializers.ValidationError(e.messages)

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