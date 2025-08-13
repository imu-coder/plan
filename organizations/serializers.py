from rest_framework import serializers
from django.contrib.auth.models import User
from django.db import models
from decimal import Decimal
from django.db import transaction
from .models import (
    Organization, OrganizationUser, StrategicObjective,
    Program, StrategicInitiative, PerformanceMeasure, 
    MainActivity, ActivityBudget, SubActivity,ActivityCostingAssumption,
    Plan, PlanReview, InitiativeFeed,SupervisorCost,PrintingCost,
    SessionCost,ParticipantCost,Accommodation,PerDiem,AirTransport,
    LandTransport,Location,ProcurementItem
)
from django.db.models import Q
import logging

# Set up logger
logger = logging.getLogger(__name__)

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name']
        read_only_fields = ['id']

class OrganizationUserSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    user_id = serializers.IntegerField(write_only=True)
    organization_name = serializers.CharField(source='organization.name', read_only=True)

    class Meta:
        model = OrganizationUser
        fields = ['id', 'user', 'user_id', 'organization', 'organization_name', 'role', 'created_at']
        read_only_fields = ['id', 'created_at']

class InitiativeFeedSerializer(serializers.ModelSerializer):
    strategic_objective_title = serializers.CharField(
        source='strategic_objective.title',
        read_only=True,
        allow_null=True
    )
    
    class Meta:
        model = InitiativeFeed
        fields = ['id', 'name', 'description', 'strategic_objective', 'strategic_objective_title', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class OrganizationSerializer(serializers.ModelSerializer):
    parent_name = serializers.CharField(source='parent.name', read_only=True, allow_null=True)
    children = serializers.SerializerMethodField()
    users = serializers.SerializerMethodField()
    core_values = serializers.JSONField(required=False, allow_null=True)

    class Meta:
        model = Organization
        fields = [
            'id', 'name', 'type', 'parent', 'parent_name', 'children',
            'vision', 'mission', 'core_values', 'users',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        
    def get_children(self, obj):
        try:
            return OrganizationSerializer(obj.children.all(), many=True).data
        except Exception as e:
            logger.exception(f"Error getting children for organization {obj.id}: {str(e)}")
            return []
            
    def get_users(self, obj):
        # Get User objects through OrganizationUser relationship
        try:
            org_users = obj.users.all()
            user_data = []
            for org_user in org_users:
                try:
                    user = org_user.user  # Access the related User object
                    user_data.append({
                        'id': user.id,
                        'username': user.username,
                        'email': user.email,
                        'first_name': user.first_name,
                        'last_name': user.last_name
                    })
                except Exception as e:
                    logger.exception(f"Error serializing user for organization {obj.id}: {str(e)}")
            return user_data
        except Exception as e:
            logger.exception(f"Error getting users for organization {obj.id}: {str(e)}")
            return []
            
    def get_users(self, obj):
        # Get User objects through OrganizationUser relationship
        org_users = obj.users.all()
        user_data = []
        for org_user in org_users:
            try:
                user = org_user.user  # Access the related User object
                user_data.append({
                    'id': user.id,
                    'username': user.username,
                    'email': user.email,
                    'first_name': user.first_name,
                    'last_name': user.last_name
                })
            except Exception as e:
                logger.exception(f"Error serializing user for organization {obj.id}: {str(e)}")
        return user_data
            
    def to_representation(self, instance):
        try:
            # Get the normal representation
            representation = super().to_representation(instance)
            
            # Check if core_values is null and replace with empty array for consistency
            if representation.get('core_values') is None:
                representation['core_values'] = []
                
            return representation
        except Exception as e:
            logger.exception(f"Error in OrganizationSerializer.to_representation: {str(e)}")
            # Return a minimal representation to avoid complete failure
            return {
                'id': instance.id,
                'name': instance.name,
                'type': instance.type,
                'core_values': []
            }
            
    def update(self, instance, validated_data):
        try:
            logger.info(f"Updating organization {instance.id} with data: {validated_data}")
            
            # Handle core_values specially to ensure consistency
            if 'core_values' in validated_data:
                # If we get None, convert to empty list
                if validated_data['core_values'] is None:
                    validated_data['core_values'] = []
                # If we get a string, try to parse as JSON
                elif isinstance(validated_data['core_values'], str):
                    try:
                        import json
                        validated_data['core_values'] = json.loads(validated_data['core_values'])
                    except:
                        validated_data['core_values'] = []
            
            return super().update(instance, validated_data)
        except Exception as e:
            logger.exception(f"Error updating organization {instance.id}: {str(e)}")
            raise serializers.ValidationError(f"Update failed: {str(e)}")


class ActivityBudgetSerializer(serializers.ModelSerializer):
    total_funding = serializers.SerializerMethodField()
    estimated_cost = serializers.SerializerMethodField()
    funding_gap = serializers.SerializerMethodField()
    sub_activity_name = serializers.CharField(source='sub_activity.name', read_only=True)
    sub_activity_type = serializers.CharField(source='sub_activity.activity_type', read_only=True)
    
    class Meta:
        model = ActivityBudget
        fields = '__all__'
    
    def get_total_funding(self, obj):
        return obj.total_funding
    
    def get_estimated_cost(self, obj):
        return obj.estimated_cost
    
    def get_funding_gap(self, obj):
        return obj.funding_gap

class SubActivitySerializer(serializers.ModelSerializer):
    main_activity_name = serializers.CharField(source='main_activity.name', read_only=True)
    estimated_cost = serializers.SerializerMethodField()
    total_funding = serializers.SerializerMethodField()
    funding_gap = serializers.SerializerMethodField()
    
    class Meta:
        model = SubActivity
        fields = '__all__'
    
    def get_estimated_cost(self, obj):
        return obj.estimated_cost
    
    def get_total_funding(self, obj):
        return obj.total_funding
    
    def get_funding_gap(self, obj):
        return obj.funding_gap
class MainActivitySerializer(serializers.ModelSerializer):
    initiative_name = serializers.CharField(source='initiative.name', read_only=True)
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    sub_activities = SubActivitySerializer(many=True, read_only=True)
    total_budget = serializers.SerializerMethodField()
    total_funding = serializers.SerializerMethodField()
    funding_gap = serializers.SerializerMethodField()
    # Keep legacy budget field for backward compatibility
    budget = ActivityBudgetSerializer(read_only=True, source='legacy_budgets.first')
    
    class Meta:
        model = MainActivity
        fields = '__all__'
    
    def get_total_budget(self, obj):
        # Calculate total budget from sub-activities + legacy budget
        total = 0
        
        # Add from sub-activities
        for sub_activity in obj.sub_activities.all():
            total += sub_activity.estimated_cost
        
        # Add legacy budget if no sub-activities
        if obj.sub_activities.count() == 0 and hasattr(obj, 'budget') and obj.budget:
            legacy_cost = (obj.budget.estimated_cost_with_tool 
                          if obj.budget.budget_calculation_type == 'WITH_TOOL'
                          else obj.budget.estimated_cost_without_tool)
            total += legacy_cost
            
        return total
    
    def get_total_funding(self, obj):
        # Calculate total funding from sub-activities + legacy budget
        total = 0
        
        # Add from sub-activities
        for sub_activity in obj.sub_activities.all():
            total += sub_activity.total_funding
        
        # Add legacy budget funding if no sub-activities
        if obj.sub_activities.count() == 0 and hasattr(obj, 'budget') and obj.budget:
            total += (obj.budget.government_treasury + obj.budget.sdg_funding + 
                     obj.budget.partners_funding + obj.budget.other_funding)
            
        return total
    
    def get_funding_gap(self, obj):
        return self.get_total_budget(obj) - self.get_total_funding(obj)


class ActivityCostingAssumptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityCostingAssumption
        fields = [
            'id', 'activity_type', 'location', 'cost_type', 'amount',
            'description', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_amount(self, value):
        if value < 0:
            raise serializers.ValidationError('Amount cannot be negative')
        return value

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'amount' in data:
            data['amount'] = float(data['amount'] or 0)
        return data



class LocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ['id', 'name', 'region', 'is_hardship_area', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

class LandTransportSerializer(serializers.ModelSerializer):
    origin_name = serializers.CharField(source='origin.name', read_only=True)
    destination_name = serializers.CharField(source='destination.name', read_only=True)
    
    class Meta:
        model = LandTransport
        fields = ['id', 'origin', 'origin_name', 'destination', 'destination_name', 
                  'trip_type', 'price', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'origin_name', 'destination_name']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'price' in data:
            data['price'] = float(data['price'] or 0)
        return data

class AirTransportSerializer(serializers.ModelSerializer):
    origin_name = serializers.CharField(source='origin.name', read_only=True)
    destination_name = serializers.CharField(source='destination.name', read_only=True)
    
    class Meta:
        model = AirTransport
        fields = ['id', 'origin', 'origin_name', 'destination', 'destination_name', 
                  'price', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'origin_name', 'destination_name']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'price' in data:
            data['price'] = float(data['price'] or 0)
        return data


class PerDiemSerializer(serializers.ModelSerializer):
    location_name = serializers.CharField(source='location.name', read_only=True)
    
    class Meta:
        model = PerDiem
        fields = ['id', 'location', 'location_name', 'amount', 'hardship_allowance_amount', 
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'location_name']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'amount' in data:
            data['amount'] = float(data['amount'] or 0)
        if 'hardship_allowance_amount' in data:
            data['hardship_allowance_amount'] = float(data['hardship_allowance_amount'] or 0)
        return data

class AccommodationSerializer(serializers.ModelSerializer):
    location_name = serializers.CharField(source='location.name', read_only=True)
    service_type_display = serializers.CharField(source='get_service_type_display', read_only=True)
    
    class Meta:
        model = Accommodation
        fields = ['id', 'location', 'location_name', 'service_type', 'service_type_display', 
                  'price', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'location_name', 'service_type_display']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'price' in data:
            data['price'] = float(data['price'] or 0)
        return data

class ParticipantCostSerializer(serializers.ModelSerializer):
    cost_type_display = serializers.CharField(source='get_cost_type_display', read_only=True)
    
    class Meta:
        model = ParticipantCost
        fields = ['id', 'cost_type', 'cost_type_display', 'price', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'cost_type_display']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'price' in data:
            data['price'] = float(data['price'] or 0)
        return data

class SessionCostSerializer(serializers.ModelSerializer):
    cost_type_display = serializers.CharField(source='get_cost_type_display', read_only=True)
    
    class Meta:
        model = SessionCost
        fields = ['id', 'cost_type', 'cost_type_display', 'price', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'cost_type_display']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'price' in data:
            data['price'] = float(data['price'] or 0)
        return data

class PrintingCostSerializer(serializers.ModelSerializer):
    document_type_display = serializers.CharField(source='get_document_type_display', read_only=True)
    
    class Meta:
        model = PrintingCost
        fields = ['id', 'document_type', 'document_type_display', 'price_per_page', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'document_type_display']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'price_per_page' in data:
            data['price_per_page'] = float(data['price_per_page'] or 0)
        return data

class SupervisorCostSerializer(serializers.ModelSerializer):
    cost_type_display = serializers.CharField(source='get_cost_type_display', read_only=True)
    
    class Meta:
        model = SupervisorCost
        fields = ['id', 'cost_type', 'cost_type_display', 'amount', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'cost_type_display']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'amount' in data:
            data['amount'] = float(data['amount'] or 0)
        return data

class ProcurementItemSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    unit_display = serializers.CharField(source='get_unit_display', read_only=True)
    
    class Meta:
        model = ProcurementItem
        fields = ['id', 'category', 'category_display', 'name', 'unit', 'unit_display', 'unit_price', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'category_display', 'unit_display']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'unit_price' in data:
            data['unit_price'] = float(data['unit_price'] or 0)
        return data


class PerformanceMeasureSerializer(serializers.ModelSerializer):
    initiative_name = serializers.CharField(source='initiative.name', read_only=True)
    quarterly_sum = serializers.SerializerMethodField()
    organization_id = serializers.IntegerField(write_only=True, required=False)
    organization_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = PerformanceMeasure
        fields = [
            'id', 'initiative', 'initiative_name', 'name', 'weight',
            'baseline', 'target_type', 'q1_target', 'q2_target', 'q3_target', 'q4_target',
            'annual_target', 'quarterly_sum', 'created_at', 'updated_at',
            'organization', 'organization_id', 'organization_name',
            'selected_months', 'selected_quarters'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'quarterly_sum', 'organization_name']

    def get_organization_name(self, obj):
        return obj.organization.name if obj.organization else None

    def get_quarterly_sum(self, obj):
        return float(obj.q1_target + obj.q2_target + obj.q3_target + obj.q4_target)

    def validate(self, data):
        # Validate based on target_type
        target_type = data.get('target_type', 'cumulative')
        q1_target = data.get('q1_target', 0)
        q2_target = data.get('q2_target', 0)
        q3_target = data.get('q3_target', 0)
        q4_target = data.get('q4_target', 0)
        annual_target = data.get('annual_target', 0)
        
        if target_type == 'cumulative':
            # Sum of quarterly targets should equal annual target
            quarterly_sum = q1_target + q2_target + q3_target + q4_target
            if quarterly_sum != annual_target:
                raise serializers.ValidationError({
                    'annual_target': f'For cumulative targets, sum of quarterly targets ({quarterly_sum}) must equal annual target ({annual_target})'
                })
        elif target_type == 'increasing':
            # Targets should be in ascending order
            if not (q1_target <= q2_target <= q3_target <= q4_target):
                raise serializers.ValidationError({
                    'q1_target': 'For increasing targets, quarterly targets must be in ascending order (Q1 ≤ Q2 ≤ Q3 ≤ Q4)'
                })
            # Q4 must equal annual target
            if q4_target != annual_target:
                raise serializers.ValidationError({
                    'q4_target': f'For increasing targets, Q4 target ({q4_target}) must equal annual target ({annual_target})'
                })
        elif target_type == 'decreasing':
            # Targets should be in descending order
            if not (q1_target >= q2_target >= q3_target >= q4_target):
                raise serializers.ValidationError({
                    'q1_target': 'For decreasing targets, quarterly targets must be in descending order (Q1 ≥ Q2 ≥ Q3 ≥ Q4)'
                })
            # Q4 must equal annual target
            if q4_target != annual_target:
                raise serializers.ValidationError({
                    'q4_target': f'For decreasing targets, Q4 target ({q4_target}) must equal annual target ({annual_target})'
                })
        
        # Validate against the expected max weight (35% of initiative weight)
        if 'initiative' in data and 'weight' in data:
            try:
                initiative_id = data['initiative']
                weight_value = data['weight']
                
                if isinstance(initiative_id, StrategicInitiative):
                    initiative = initiative_id
                else:
                    initiative = StrategicInitiative.objects.get(id=initiative_id)
                
                # Calculate 35% of initiative weight
                max_allowed_weight = round(float(initiative.weight) * 0.35, 2)
                
                # Get total weight of existing measures (excluding current one)
                instance_id = self.instance.id if self.instance else None
                
                measures_query = PerformanceMeasure.objects.filter(initiative=initiative)
                if instance_id:
                    measures_query = measures_query.exclude(id=instance_id)
                
                total_existing_weight = measures_query.aggregate(
                    total=models.Sum('weight')
                )['total'] or 0
                
                # Check if adding this weight would exceed the limit
                if float(total_existing_weight) + float(weight_value) > max_allowed_weight:
                    raise serializers.ValidationError({
                        'weight': f'Total weight of performance measures cannot exceed 35% of initiative weight ({max_allowed_weight}). Current total: {float(total_existing_weight)}, This measure: {float(weight_value)}'
                    })
            except StrategicInitiative.DoesNotExist:
                pass  # Initiative validation will be handled elsewhere
            except Exception as e:
                logger.exception(f"Error validating performance measure weight: {str(e)}")
            
        # Basic weight validation
        if data.get('weight', 0) < 0 or data.get('weight', 0) > 100:
            raise serializers.ValidationError('Weight must be between 0 and 100')
            
        return data

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Ensure numeric fields are properly formatted
        numeric_fields = ['q1_target', 'q2_target', 'q3_target', 'q4_target', 'annual_target', 'weight']
        for field in numeric_fields:
            if field in data:
                data[field] = float(data[field] or 0)
        return data

class StrategicInitiativeSerializer(serializers.ModelSerializer):
    performance_measures = PerformanceMeasureSerializer(many=True, read_only=True)
    main_activities = MainActivitySerializer(many=True, read_only=True)
    strategic_objective_title = serializers.CharField(
        source='strategic_objective.title',
        read_only=True,
        allow_null=True
    )
    program_name = serializers.CharField(
        source='program.name',
        read_only=True,
        allow_null=True
    )
    total_measures_weight = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        read_only=True,
        default=0
    )
    total_activities_weight = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        read_only=True,
        default=0
    )
    is_default = serializers.BooleanField(default=True)
    organization_id = serializers.IntegerField(write_only=True, required=False)
    organization_name = serializers.SerializerMethodField(read_only=True)
    initiative_feed = serializers.PrimaryKeyRelatedField(
        queryset=InitiativeFeed.objects.filter(is_active=True),
        required=False,
        allow_null=True
    )
    initiative_feed_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = StrategicInitiative
        fields = [
            'id', 'name', 'weight', 'is_default',
            'strategic_objective', 'strategic_objective_title',
            'program', 'program_name',
            'performance_measures', 'main_activities',
            'total_measures_weight', 'total_activities_weight',
            'created_at', 'updated_at', 'organization',
            'organization_id', 'organization_name',
            'initiative_feed', 'initiative_feed_name'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'organization_name', 'initiative_feed_name']

    def get_organization_name(self, obj):
        return obj.organization.name if obj.organization else None
        
    def get_initiative_feed_name(self, obj):
        return obj.initiative_feed.name if obj.initiative_feed else None

    def validate(self, data):
        # Ensure initiative is linked to exactly one parent
        parents = sum(1 for x in [
            data.get('strategic_objective', None),
            data.get('program', None)
        ] if x is not None)
        
        if parents != 1:
            raise serializers.ValidationError(
                'Initiative must be linked to exactly one parent (objective or program)'
            )
        
        # If an initiative_feed is provided, ensure the name matches
        if 'initiative_feed' in data and data['initiative_feed'] and not data.get('name'):
            # Copy the name from the initiative feed
            data['name'] = data['initiative_feed'].name
            
        # Get the parent objective to check weights - handle type conversion
        if 'strategic_objective' in data and data['strategic_objective']:
            try:
                # Handle case where strategic_objective is a full object instead of ID
                objective_id = data['strategic_objective']
                if isinstance(objective_id, StrategicObjective):
                    objective_id = objective_id.id
                elif isinstance(objective_id, str) and not objective_id.isdigit():
                    # Try to extract numeric ID if it's a string representation of an object
                    import re
                    numeric_match = re.search(r'\d+', objective_id)
                    if numeric_match:
                        objective_id = int(numeric_match.group())
                        
                objective = StrategicObjective.objects.get(id=objective_id)
                
                # If this is a default objective with planner_weight, use that for validation
                if objective.is_default and objective.planner_weight is not None:
                    effective_weight = objective.planner_weight
                else:
                    effective_weight = objective.weight
                    
                # Validate that initiative weight doesn't exceed parent weight
                if 'weight' in data and data['weight'] > effective_weight:
                    raise serializers.ValidationError(
                        f"Initiative weight ({data['weight']}) cannot exceed parent objective weight ({effective_weight})"
                    )
            except StrategicObjective.DoesNotExist:
                pass
        
        return data

    def to_representation(self, instance):
        try:
            data = super().to_representation(instance)
            # Ensure numeric fields are properly formatted
            if 'weight' in data:
                data['weight'] = float(data['weight'] or 0)
            if 'total_measures_weight' in data:
                data['total_measures_weight'] = float(data['total_measures_weight'] or 0)
            if 'total_activities_weight' in data:
                data['total_activities_weight'] = float(data['total_activities_weight'] or 0)
            return data
        except Exception as e:
            logger.exception(f"Error in StrategicInitiativeSerializer.to_representation: {str(e)}")
            # Return minimal representation to avoid complete failure
            return {
                'id': str(instance.id),
                'name': str(instance.name),
                'weight': float(instance.weight or 0),
                'is_default': bool(instance.is_default)
            }

    def create(self, validated_data):
        try:
            # Handle organization_id if present
            organization_id = validated_data.pop('organization_id', None)            
            if organization_id is not None:
                # Make sure it's a number
                if hasattr(organization_id, 'id'):
                    # Handle case where this is a full Organization object
                    validated_data['organization_id'] = organization_id.id
                else:
                    validated_data['organization_id'] = int(organization_id)
                
            logger.info(f"Creating initiative with data: {validated_data}")
            return super().create(validated_data)
        except Exception as e:
            logger.exception(f"Error creating initiative: {str(e)}")
            raise serializers.ValidationError(f"Failed to create initiative: {str(e)}")

    def update(self, instance, validated_data):
        try:
            # Handle organization_id if present
            organization_id = validated_data.pop('organization_id', None)            
            if organization_id is not None:
                # Make sure it's a number
                if hasattr(organization_id, 'id'):
                    # Handle case where this is a full Organization object
                    validated_data['organization_id'] = organization_id.id
                else:
                    validated_data['organization_id'] = int(organization_id)
            
            logger.info(f"Updating initiative {instance.id} with data: {validated_data}")
            return super().update(instance, validated_data)
        except Exception as e:
            logger.exception(f"Error updating initiative: {str(e)}")
            raise serializers.ValidationError(f"Failed to update initiative: {str(e)}")


class ProgramSerializer(serializers.ModelSerializer):
    initiatives = StrategicInitiativeSerializer(many=True, read_only=True)
    strategic_objective_title = serializers.CharField(
        source='strategic_objective.title',
        read_only=True
    )
    is_default = serializers.BooleanField(default=True)

    class Meta:
        model = Program
        fields = [
            'id', 'strategic_objective', 'strategic_objective_title',
            'name', 'description', 'is_default',
            'initiatives', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        return data

class StrategicObjectiveSerializer(serializers.ModelSerializer):
    programs = ProgramSerializer(many=True, read_only=True)
    initiatives = StrategicInitiativeSerializer(many=True, read_only=True)
    total_weight = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        read_only=True,
        help_text="Total weight of all initiatives"
    )
    is_default = serializers.BooleanField(default=True)
    planner_weight = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        required=False,
        allow_null=True,
        help_text="Custom weight assigned by planner"
    )
    effective_weight = serializers.SerializerMethodField(
        help_text="The actual weight to be used (planner_weight if set, otherwise weight)"
    )

    class Meta:
        model = StrategicObjective
        fields = [
            'id', 'title', 'description', 'weight', 'planner_weight', 'effective_weight', 'is_default',
            'programs', 'initiatives', 'total_weight',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'total_weight', 'effective_weight']

    def get_effective_weight(self, obj):
        # Return planner_weight if set, otherwise return weight
        if obj.planner_weight is not None:
            return obj.planner_weight
        return obj.weight

    def validate_weight(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError('Weight must be between 0 and 100')
        return value

    def validate_planner_weight(self, value):
        if value is not None and (value < 0 or value > 100):
            raise serializers.ValidationError('Planner weight must be between 0 and 100')
        return value

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'weight' in data:
            data['weight'] = float(data['weight'] or 0)
        if 'planner_weight' in data:
            data['planner_weight'] = float(data['planner_weight']) if data['planner_weight'] is not None else None
        if 'effective_weight' in data:
            data['effective_weight'] = float(data['effective_weight'] or 0)
        if 'total_weight' in data:
            data['total_weight'] = float(data['total_weight'] or 0)
        return data

class ActivityCostingAssumptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityCostingAssumption
        fields = [
            'id', 'activity_type', 'location', 'cost_type',
            'amount', 'description', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_amount(self, value):
        if value < 0:
            raise serializers.ValidationError('Amount cannot be negative')
        return value

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'amount' in data:
            data['amount'] = float(data['amount'] or 0)
        return data

class PlanReviewSerializer(serializers.ModelSerializer):
    evaluator_name = serializers.CharField(source='evaluator.user.get_full_name', read_only=True)
    plan_name = serializers.CharField(source='plan.__str__', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = PlanReview
        fields = [
            'id', 'plan', 'plan_name', 'evaluator', 'evaluator_name',
            'status', 'status_display', 'feedback', 'reviewed_at'
        ]
        read_only_fields = ['id']

    def validate(self, data):
        # Ensure evaluator has EVALUATOR role
        evaluator = data.get('evaluator')
        if evaluator and evaluator.role != 'EVALUATOR':
            raise serializers.ValidationError('Only users with EVALUATOR role can review plans')

        # Ensure plan is in SUBMITTED status
        plan = data.get('plan')
        if plan and plan.status != 'SUBMITTED':
            raise serializers.ValidationError('Can only review plans that are in SUBMITTED status')

        # Ensure reviewed_at is set
        if 'reviewed_at' not in data or not data['reviewed_at']:
            from django.utils import timezone
            data['reviewed_at'] = timezone.now()

        return data

class PlanSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    strategic_objective_title = serializers.CharField(source='strategic_objective.title', read_only=True)
    program_name = serializers.CharField(source='program.name', read_only=True)
    reviews = PlanReviewSerializer(many=True, read_only=True)
    selected_objectives_data = serializers.SerializerMethodField()
    objectives = serializers.SerializerMethodField()
    
    class Meta:
        model = Plan
        fields = '__all__'
    
    def get_selected_objectives_data(self, obj):
        """Get complete data for all selected objectives with their custom weights"""
        try:
            selected_objectives = obj.selected_objectives.all()
            objectives_data = []
            
            for objective in selected_objectives:
                # Get custom weight from selected_objectives_weights if available
                custom_weight = None
                if obj.selected_objectives_weights and str(objective.id) in obj.selected_objectives_weights:
                    custom_weight = obj.selected_objectives_weights[str(objective.id)]
                
                # Get effective weight (custom weight if set, otherwise original weight)
                effective_weight = custom_weight if custom_weight is not None else objective.weight
                
                # Get initiatives for this objective - ONLY show planner's organization initiatives
                from django.db import models
                initiatives = objective.initiatives.filter(
                    models.Q(is_default=True) | 
                    models.Q(organization=obj.organization)
                ).exclude(
                    models.Q(organization__isnull=False) & ~models.Q(organization=obj.organization)
                )
                
                initiatives_data = []
                for initiative in initiatives:
                    # Get performance measures - ONLY from planner's organization
                    measures = initiative.performance_measures.filter(
                        models.Q(organization=obj.organization)
                    ).exclude(
                        models.Q(organization__isnull=False) & ~models.Q(organization=obj.organization)
                    )
                    
                    # Get main activities - ONLY from planner's organization
                    activities = initiative.main_activities.filter(
                        models.Q(organization=obj.organization)
                    ).exclude(
                        models.Q(organization__isnull=False) & ~models.Q(organization=obj.organization)
                    )
                    
                    initiatives_data.append({
                        'id': initiative.id,
                        'name': initiative.name,
                        'weight': float(initiative.weight),
                        'organization_name': initiative.organization.name if initiative.organization else None,
                        'performance_measures': PerformanceMeasureSerializer(measures, many=True).data,
                        'main_activities': MainActivitySerializer(activities, many=True).data
                    })
                
                objectives_data.append({
                    'id': objective.id,
                    'title': objective.title,
                    'description': objective.description,
                    'weight': float(objective.weight),
                    'planner_weight': float(custom_weight) if custom_weight is not None else None,
                    'effective_weight': float(effective_weight),
                    'is_default': objective.is_default,
                    'initiatives': initiatives_data
                })
            
            return objectives_data
        except Exception as e:
            print(f"Error in get_selected_objectives_data: {str(e)}")
            return []
    
    def get_objectives(self, obj):
        """Alias for selected_objectives_data for backward compatibility"""
        return self.get_selected_objectives_data(obj)
    
    def create(self, validated_data):
        """Override create to handle selected objectives and their weights"""
        try:
            with transaction.atomic():
                # Extract selected objectives data if provided
                selected_objectives_data = validated_data.pop('selected_objectives', [])
                selected_objectives_weights = validated_data.pop('selected_objectives_weights', {})
                
                # Create the plan
                plan = Plan.objects.create(**validated_data)
                
                # Add selected objectives if provided
                if selected_objectives_data:
                    # Handle both list of IDs and list of objects
                    if isinstance(selected_objectives_data, list):
                        if selected_objectives_data and isinstance(selected_objectives_data[0], dict):
                            # List of objects with 'id' field
                            objective_ids = [obj['id'] for obj in selected_objectives_data if 'id' in obj]
                        else:
                            # List of IDs
                            objective_ids = selected_objectives_data
                    else:
                        objective_ids = []
                    
                    if objective_ids:
                        plan.selected_objectives.set(objective_ids)
                
                # Save custom weights if provided
                if selected_objectives_weights:
                    plan.selected_objectives_weights = selected_objectives_weights
                    plan.save()
                
                return plan
        except Exception as e:
            print(f"Error creating plan: {str(e)}")
            import traceback
            print(f"Traceback: {traceback.format_exc()}")
            raise serializers.ValidationError(f"Failed to create plan: {str(e)}")
    
    def update(self, instance, validated_data):
        """Override update to handle selected objectives and their weights"""
        try:
            with transaction.atomic():
                # Extract selected objectives data if provided
                selected_objectives_data = validated_data.pop('selected_objectives', [])
                selected_objectives_weights = validated_data.pop('selected_objectives_weights', {})
                
                # Update the plan fields
                for attr, value in validated_data.items():
                    setattr(instance, attr, value)
                
                # Update selected objectives if provided
                if selected_objectives_data:
                    # Handle both list of IDs and list of objects
                    if isinstance(selected_objectives_data, list):
                        if selected_objectives_data and isinstance(selected_objectives_data[0], dict):
                            # List of objects with 'id' field
                            objective_ids = [obj['id'] for obj in selected_objectives_data if 'id' in obj]
                        else:
                            # List of IDs
                            objective_ids = selected_objectives_data
                    else:
                        objective_ids = []
                    
                    if objective_ids:
                        instance.selected_objectives.set(objective_ids)
                
                # Update custom weights if provided
                if selected_objectives_weights:
                    instance.selected_objectives_weights = selected_objectives_weights
                    
                instance.save()
                
                return instance
        except Exception as e:
            print(f"Error updating plan: {str(e)}")
            import traceback
            print(f"Traceback: {traceback.format_exc()}")
            raise serializers.ValidationError(f"Failed to update plan: {str(e)}")

class InitiativeFeedSerializer(serializers.ModelSerializer):
    strategic_objective_title = serializers.CharField(source='strategic_objective.title', read_only=True)
    
    class Meta:
        model = InitiativeFeed
        fields = '__all__'